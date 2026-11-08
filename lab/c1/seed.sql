-- Repeated runs retain orders and credentials; only lab fixtures/jobs are reset.
grant create session, create table, create procedure, create sequence, create job to SHOPAPP;
alter session set current_schema=SHOPAPP;
declare
 n number;
begin
 select count(*) into n from dba_tables where owner='SHOPAPP' and table_name='CUSTOMERS';
 if n=0 then
 execute immediate 'create table customers (customer_id number primary key, name varchar2(80) not null, email varchar2(120) unique, status varchar2(10) default ''ACTIVE'' check (status in (''ACTIVE'',''INACTIVE''))) tablespace SHOP_DATA';
 execute immediate 'create table products (product_id number primary key, name varchar2(80) not null, price number(10,2) check (price>0), stock number check (stock>=0)) tablespace SHOP_DATA';
 execute immediate 'create table orders (order_id number primary key, customer_id number references customers, ordered_at date not null, status varchar2(10) check (status in (''NEW'',''SHIPPED'')), total number(12,2) check (total>=0)) tablespace SHOP_DATA';
 execute immediate 'create index orders_customer_ix on orders(customer_id) tablespace SHOP_DATA';
 execute immediate 'create index orders_status_ix on orders(status,ordered_at) tablespace SHOP_DATA';
 execute immediate 'create table order_lines (order_id number references orders, line_no number, product_id number references products, quantity number check(quantity>0), unit_price number(10,2) check(unit_price>0), primary key(order_id,line_no)) tablespace SHOP_DATA';
 execute immediate 'create index lines_product_ix on order_lines(product_id) tablespace SHOP_DATA';
 execute immediate 'create table order_history (order_id number, ordered_at date not null, total number(12,2), status varchar2(10)) tablespace SHOP_DATA partition by range(ordered_at) interval(numtoyminterval(1,''MONTH'')) (partition p_before_2026 values less than (date ''2026-01-01''), partition p_202601 values less than (date ''2026-02-01''))';
 execute immediate 'create index history_order_ix on order_history(order_id) local tablespace SHOP_DATA';
 execute immediate 'create sequence order_seq start with 30001';
 end if;
end;
/
declare n number; begin
 select count(*) into n from customers;
 if n=0 then
 dbms_random.seed(31031);
 insert into customers select level, 'Customer '||level, 'customer'||level||'@example.invalid', 'ACTIVE' from dual connect by level<=3000;
 insert into products select level, 'Product '||level, round(dbms_random.value(1,500),2), 1000 from dual connect by level<=2000;
 insert into orders select level, mod(level-1,3000)+1, date '2026-01-01'+mod(level,270), case when mod(level,4)=0 then 'NEW' else 'SHIPPED' end, 0 from dual connect by level<=30000;
 insert into order_lines select o.order_id, l.n, mod(o.order_id+l.n,2000)+1, l.n, p.price from orders o cross join (select level n from dual connect by level<=3) l join products p on p.product_id=mod(o.order_id+l.n,2000)+1;
 update orders o set total=(select sum(quantity*unit_price) from order_lines l where l.order_id=o.order_id);
 insert into order_history select order_id,ordered_at,total,status from orders where ordered_at<date '2026-02-01';
 commit;
 end if;
end;
/
create or replace package SHOPAPP.workload as
 procedure place_orders(p_count number);
 procedure ship_orders;
 procedure nightly_purge;
 procedure refresh_stats;
end;
/
create or replace package body SHOPAPP.workload as
 procedure place_orders(p_count number) is oid number; pid number; price_value number;
 begin
 for i in 1..p_count loop
 oid:=order_seq.nextval; pid:=mod(oid,2000)+1;
 select price into price_value from products where product_id=pid;
 insert into orders values(oid,mod(oid,3000)+1,sysdate,'NEW',price_value);
 insert into order_lines values(oid,1,pid,1,price_value);
 end loop; commit;
 end;
 procedure ship_orders is begin update orders set status='SHIPPED' where status='NEW' and ordered_at<sysdate-5/1440; commit; end;
 procedure nightly_purge is begin
 insert into order_history select order_id,ordered_at,total,status from orders where ordered_at<sysdate-730 and status='SHIPPED';
 delete from order_lines where order_id in (select order_id from orders where ordered_at<sysdate-730 and status='SHIPPED');
 delete from orders where ordered_at<sysdate-730 and status='SHIPPED'; commit; end;
 procedure refresh_stats is begin dbms_stats.gather_schema_stats('SHOPAPP'); end;
end;
/
-- Keep the diagnostic statistics fixture stale even after an automatic stats task.
begin
 dbms_stats.unlock_table_stats('SHOPAPP','PRODUCTS');
 dbms_stats.gather_schema_stats('SHOPAPP');
 update products set stock=stock+1;
 commit;
 dbms_stats.flush_database_monitoring_info;
 dbms_stats.lock_table_stats('SHOPAPP','PRODUCTS');
end;
/
-- A disposable source ensures the view really references a dropped column.
begin execute immediate 'drop table SHOPAPP.view_source purge'; exception when others then if sqlcode<>-942 then raise; end if; end;
/
create table SHOPAPP.view_source (id number, retired_column number) tablespace SHOP_DATA;
create or replace view SHOPAPP.invalid_customer_view as select id,retired_column from SHOPAPP.view_source;
alter table SHOPAPP.view_source drop column retired_column;
alter index SHOPAPP.history_order_ix modify partition p_202601 unusable;
begin
 for j in (select job_name from dba_scheduler_jobs where owner='SHOPAPP' and job_name in ('PLACE_ORDERS_JOB','SHIP_ORDERS_JOB','NIGHTLY_PURGE_JOB','REPORT_EXPORT_JOB')) loop
 dbms_scheduler.drop_job('SHOPAPP.'||j.job_name,force=>true);
 end loop;
 dbms_scheduler.create_job('SHOPAPP.PLACE_ORDERS_JOB','PLSQL_BLOCK','begin SHOPAPP.workload.place_orders(20); end;',start_date=>systimestamp+interval '1' minute,repeat_interval=>'FREQ=MINUTELY;INTERVAL=1',enabled=>true,auto_drop=>false);
 dbms_scheduler.create_job('SHOPAPP.SHIP_ORDERS_JOB','PLSQL_BLOCK','begin SHOPAPP.workload.ship_orders; end;',start_date=>systimestamp+interval '5' minute,repeat_interval=>'FREQ=MINUTELY;INTERVAL=5',enabled=>true,auto_drop=>false);
 dbms_scheduler.create_job('SHOPAPP.NIGHTLY_PURGE_JOB','PLSQL_BLOCK','begin SHOPAPP.workload.nightly_purge; end;',start_date=>systimestamp+interval '1' day,repeat_interval=>'FREQ=DAILY;BYHOUR=2;BYMINUTE=0;BYSECOND=0',enabled=>true,auto_drop=>false);
 dbms_scheduler.create_job('SHOPAPP.REPORT_EXPORT_JOB','PLSQL_BLOCK','begin raise_application_error(-20001,''C1 intentional report export failure''); end;',start_date=>systimestamp,repeat_interval=>'FREQ=MINUTELY;INTERVAL=30',enabled=>true,auto_drop=>false);
 dbms_scheduler.set_attribute('SHOPAPP.REPORT_EXPORT_JOB','logging_level',dbms_scheduler.logging_full);
 dbms_scheduler.run_job('SHOPAPP.REPORT_EXPORT_JOB',use_current_session=>false);
end;
/
alter session set current_schema=SYS;
