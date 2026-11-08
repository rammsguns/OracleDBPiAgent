set echo off verify off feedback off define off
whenever sqlerror exit failure rollback
alter session set container=PIPDB1;
declare
 n number;
 procedure ddl(s varchar2) is begin execute immediate s; end;
 function missing(name varchar2, kind varchar2) return boolean is
 begin select count(*) into n from dba_objects where owner='BULKAPP' and object_name=name and object_type=kind; return n=0; end;
begin
 if sys_context('USERENV','CON_NAME') <> 'PIPDB1' then raise_application_error(-20000,'Wrong container'); end if;
 select count(*) into n from dba_tablespaces where tablespace_name='BULK_DATA';
 if n=0 then ddl('create tablespace BULK_DATA datafile ''/opt/oracle/oradata/CDB19/PIPDB1/bulk_data01.dbf'' size 512M autoextend on next 256M maxsize 8G'); end if;
 select count(*) into n from dba_users where username='BULKAPP';
 if n=0 then
  ddl('create user BULKAPP no authentication default tablespace BULK_DATA quota unlimited on BULK_DATA');
  ddl('grant create session, create table, create view, create procedure, create sequence, create job to BULKAPP');
 end if;
 if missing('EVENTS','TABLE') then
  ddl('create table BULKAPP.EVENTS (id number, customer_id number, event_type varchar2(30), payload varchar2(200), created_at date) tablespace BULK_DATA');
  execute immediate 'insert into BULKAPP.EVENTS select level,mod(level,10000),''TYPE''||mod(level,10),rpad(''event'',100,''x''),date ''2025-01-01''+mod(level,730) from dual connect by level<=4000000';
  commit;
  ddl('alter table BULKAPP.EVENTS add constraint EVENTS_PK primary key(id) using index tablespace BULK_DATA');
  ddl('create index BULKAPP.EVENTS_CUST_IX on BULKAPP.EVENTS(customer_id) tablespace BULK_DATA');
  ddl('create index BULKAPP.EVENTS_TYPE_IX on BULKAPP.EVENTS(event_type,created_at) tablespace BULK_DATA');
 end if;
 for i in 1..1500 loop
  if missing('T'||to_char(i,'FM0000'),'TABLE') then
   ddl('create table BULKAPP.T'||to_char(i,'FM0000')||' (id number primary key, name varchar2(100)) tablespace BULK_DATA');
   ddl('create index BULKAPP.T'||to_char(i,'FM0000')||'_NAME_IX on BULKAPP.T'||to_char(i,'FM0000')||'(name) tablespace BULK_DATA');
  end if;
 end loop;
 for i in 1..750 loop
  if missing('V'||to_char(i*2,'FM0000'),'VIEW') then ddl('create view BULKAPP.V'||to_char(i*2,'FM0000')||' as select id,name from BULKAPP.T'||to_char(i*2,'FM0000')); end if;
 end loop;
 for i in 1..300 loop
  if missing('P'||to_char(i*5,'FM0000'),'PROCEDURE') then ddl('create procedure BULKAPP.P'||to_char(i*5,'FM0000')||' as begin null; end;'); end if;
 end loop;
 if missing('SALES_HIST','TABLE') then
  ddl('create table BULKAPP.SALES_HIST (id number, sold_at date, amount number) tablespace BULK_DATA partition by range(sold_at) interval(numtodsinterval(1,''DAY'')) (partition P0 values less than(date ''2025-01-01''))');
  execute immediate 'insert into BULKAPP.SALES_HIST select level,date ''2025-01-01''+level-1,level from dual connect by level<=400';
  commit;
  ddl('create index BULKAPP.SALES_HIST_IX on BULKAPP.SALES_HIST(sold_at,id) local tablespace BULK_DATA');
 end if;
 select count(*) into n from dba_tab_statistics where owner='BULKAPP' and object_type='TABLE' and last_analyzed is null;
 if n>0 then dbms_stats.gather_schema_stats('BULKAPP'); end if;
 if missing('CURSOR_CHURN','PROCEDURE') then
  ddl('create procedure BULKAPP.CURSOR_CHURN as n number; s number := trunc(dbms_random.value(1,1e9)); begin for i in 1..300 loop execute immediate ''select /* churn */ count(*) from BULKAPP.EVENTS where id = ''||to_char(s+i) into n; end loop; end;');
 end if;
 select count(*) into n from dba_scheduler_jobs where owner='BULKAPP' and job_name='CURSOR_CHURN_JOB';
 if n=0 then
  dbms_scheduler.create_job(job_name=>'BULKAPP.CURSOR_CHURN_JOB',job_type=>'STORED_PROCEDURE',job_action=>'BULKAPP.CURSOR_CHURN',start_date=>systimestamp,repeat_interval=>'FREQ=MINUTELY;INTERVAL=1',enabled=>true);
 end if;
end;
/
exit success
