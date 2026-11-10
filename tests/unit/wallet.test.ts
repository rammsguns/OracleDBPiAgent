import { afterEach, expect, it, vi } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractWallet, parseTnsNames, walletNeedsPassword } from "../../src/oracle/wallet.js";
import { validateTarget } from "../../src/config/targets.js";

const pem = "-----BEGIN ENCRYPTED PRIVATE KEY-----\nfixture\n-----END ENCRYPTED PRIVATE KEY-----";
const tns = "ALIAS_LOW=(DESCRIPTION=(ADDRESS=(PROTOCOL=TCPS)(HOST=db.example)(PORT=2484))(CONNECT_DATA=(SERVICE_NAME=app_low)))\nALIAS_HIGH=(DESCRIPTION=(ADDRESS=(PROTOCOL=TCPS)(HOST=db.example)(PORT=2484))(CONNECT_DATA=(SERVICE_NAME=app_high)))";
function zip(entries: Record<string, string>): Buffer {
	const locals: Buffer[] = [], centrals: Buffer[] = []; let offset = 0;
	for (const [name, content] of Object.entries(entries)) {
		const n = Buffer.from(name), data = Buffer.from(content), local = Buffer.alloc(30), central = Buffer.alloc(46);
		local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8); local.writeUInt32LE(0, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
		locals.push(local,n,data);
		central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0,8);central.writeUInt16LE(0,10);central.writeUInt32LE(0,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(n.length,28);central.writeUInt32LE(offset,42);
		centrals.push(central,n);offset += local.length+n.length+data.length;
	}
	const directory = Buffer.concat(centrals), eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(Object.keys(entries).length,8);eocd.writeUInt16LE(Object.keys(entries).length,10);eocd.writeUInt32LE(directory.length,12);eocd.writeUInt32LE(offset,16);
	return Buffer.concat([...locals,directory,eocd]);
}
const dirs: string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});vi.restoreAllMocks();});
function walletDir() { const dir=mkdtempSync(join(tmpdir(),"wallet-fixture-"));dirs.push(dir);chmodSync(dir,0o700);writeFileSync(join(dir,"tnsnames.ora"),tns,{mode:0o600});writeFileSync(join(dir,"ewallet.pem"),pem,{mode:0o600});return dir; }
const target = {name:"wallet-db",description:"fixture",username:"READER",passwordFile:"db.pw",defaultSchema:"APP",environment:"production-like"};

it("parses nested aliases case-insensitively and detects encrypted PEM",()=>{expect(parseTnsNames(tns)).toEqual([{alias:"ALIAS_LOW",host:"db.example",port:2484,serviceName:"app_low"},{alias:"ALIAS_HIGH",host:"db.example",port:2484,serviceName:"app_high"}]);expect(walletNeedsPassword(pem)).toBe(true);});
it("extracts only supported wallet files and refuses missing inputs and path traversal writes",()=>{
	const files=extractWallet(zip({"../ewallet.pem":pem,"tnsnames.ora":tns,"cwallet.sso":"ignored"}));expect(Object.keys(files).sort()).toEqual(["ewallet.pem","tnsnames.ora"]);
	expect(()=>extractWallet(zip({"cwallet.sso":"auto"}))).toThrow(/no ewallet.pem/);
	expect(()=>extractWallet(Buffer.from("not zip"))).toThrow(/not a wallet zip/);
});
it("resolves wallet endpoint fields and refuses unsafe dirs, files, aliases and mismatches",()=>{
	const directory=walletDir(), ok={...target,wallet:{directory,tnsAlias:"alias_low",passwordFile:"wallet.pw"}};
	validateTarget(ok);expect(ok).toMatchObject({host:"db.example",port:2484,serviceName:"app_low",protocol:"tcps"});
	for(const patch of [{wallet:{...ok.wallet,directory:"relative"}},{wallet:{...ok.wallet,tnsAlias:"missing"}},{wallet:{...ok.wallet,passwordFile:"../bad"}},{protocol:"tcp",wallet:ok.wallet},{host:"other",wallet:ok.wallet}]) expect(()=>validateTarget({...target,...patch})).toThrow();
	chmodSync(join(directory,"ewallet.pem"),0o644);expect(()=>validateTarget({...target,wallet:ok.wallet})).toThrow();
});
it("reports encrypted PEM without a wallet password file as a clear config error",()=>{const directory=walletDir();expect(()=>validateTarget({...target,wallet:{directory,tnsAlias:"ALIAS_LOW"}})).toThrow("wallet.passwordFile is required for an encrypted wallet");});

it("writes imported wallet fixture permissions in the CLI",async()=>{
	const home=mkdtempSync(join(tmpdir(),"piagent-wallet-home-"));dirs.push(home);chmodSync(home,0o700);
	const archive=join(home,"wallet.zip");writeFileSync(archive,zip({"ewallet.pem":pem,"tnsnames.ora":tns}));
	process.env.PIAGENT_HOME=home;delete process.env.PIAGENT_ENV_FILE;
	const log=vi.spyOn(console,"log").mockImplementation(()=>{});
	const {main}=await import("../../src/cli/index.js");
	await main(["node","piagent","wallet","import",archive,"--name","fixture"]);
	const dir=join(home,"wallets","fixture");expect(statSync(dir).mode & 0o777).toBe(0o700);expect(statSync(join(dir,"ewallet.pem")).mode & 0o777).toBe(0o600);expect(readFileSync(join(dir,"tnsnames.ora"),"utf8")).toBe(tns);expect(log.mock.calls.join(" ")).toContain("ALIAS_LOW");
});
