/**
 * Wallet ZIP and tnsnames handling adapted from OracleDataForge's
 * server/oracleWallet.ts (owner repository). Only ewallet.pem and tnsnames.ora
 * are retained for node-oracledb Thin mode.
 */
import { inflateRawSync } from "node:zlib";

export const WALLET_ZIP_MAX_BYTES = 2 * 1024 * 1024;
export const WALLET_FILE_MAX_BYTES = 512 * 1024;
export const WALLET_KEPT_FILES = ["ewallet.pem", "tnsnames.ora"] as const;

export interface WalletFiles { [name: string]: string }
export interface WalletService { alias: string; host: string; port: number; serviceName: string }
const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

function readZip(buf: Buffer): { name: string; data: Buffer }[] {
	if (buf.length > WALLET_ZIP_MAX_BYTES) throw new Error("Wallet zip exceeds the 2 MB limit");
	if (buf.length < 22) throw new Error("File is not a wallet zip");
	let end = -1;
	for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) if (buf.readUInt32LE(i) === EOCD) { end = i; break; }
	if (end < 0) throw new Error("File is not a valid wallet zip");
	const count = buf.readUInt16LE(end + 10);
	let offset = buf.readUInt32LE(end + 16);
	if (count === 0xffff || offset === 0xffffffff) throw new Error("Zip64 wallet archives are not supported");
	const result: { name: string; data: Buffer }[] = [];
	let hasAutoLogin = false;
	for (let n = 0; n < count; n++) {
		if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CENTRAL) throw new Error("Wallet zip directory is damaged");
		const flags = buf.readUInt16LE(offset + 8), method = buf.readUInt16LE(offset + 10);
		const compressed = buf.readUInt32LE(offset + 20), nameLength = buf.readUInt16LE(offset + 28);
		const extraLength = buf.readUInt16LE(offset + 30), commentLength = buf.readUInt16LE(offset + 32), local = buf.readUInt32LE(offset + 42);
		const name = buf.toString("utf8", offset + 46, offset + 46 + nameLength).split(/[\\/]/).pop()?.toLowerCase() ?? "";
		offset += 46 + nameLength + extraLength + commentLength;
		if (name === "cwallet.sso") hasAutoLogin = true;
		if (!(WALLET_KEPT_FILES as readonly string[]).includes(name)) continue;
		if (flags & 1) throw new Error("Password protected zip archives are not supported");
		if (method !== 0 && method !== 8) throw new Error("Wallet zip compression method is not supported");
		if (compressed > WALLET_ZIP_MAX_BYTES || local + 30 > buf.length || buf.readUInt32LE(local) !== LOCAL) throw new Error("Wallet zip entry is invalid");
		const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
		if (start + compressed > buf.length) throw new Error("Wallet zip is truncated");
		let data: Buffer;
		try { data = method === 0 ? Buffer.from(buf.subarray(start, start + compressed)) : inflateRawSync(buf.subarray(start, start + compressed), { maxOutputLength: WALLET_FILE_MAX_BYTES }); }
		catch { throw new Error("Wallet zip entry is damaged or too large"); }
		if (data.length > WALLET_FILE_MAX_BYTES) throw new Error("Wallet zip entry is too large");
		result.push({ name, data });
	}
	if (hasAutoLogin && !result.some(entry => entry.name === "ewallet.pem")) throw new Error("Wallet has no ewallet.pem; auto-login-only wallets are not supported in Thin mode");
	return result;
}

export function extractWallet(zip: Buffer): WalletFiles {
	const files: WalletFiles = {};
	for (const entry of readZip(zip)) files[entry.name] = entry.data.toString("utf8");
	if (!files["tnsnames.ora"]) {
		throw new Error("Wallet zip has no tnsnames.ora");
	}
	if (!files["ewallet.pem"]) {
		throw new Error("Wallet has no ewallet.pem");
	}
	if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(files["ewallet.pem"])) throw new Error("Wallet ewallet.pem does not contain a private key");
	if (!parseTnsNames(files["tnsnames.ora"]).length) throw new Error("Wallet tnsnames.ora lists no database services");
	return files;
}

export function walletNeedsPassword(pem: string): boolean { return /-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(pem); }

export function parseTnsNames(text: string): WalletService[] {
	const src = text.replace(/\r\n?/g, "\n").split("\n").map(line => line.replace(/#.*$/, "")).join("\n");
	const out: WalletService[] = [], seen = new Set<string>();
	const head = /([A-Za-z0-9_.$-]+)\s*=\s*(?=\()/g;
	for (let match = head.exec(src); match; match = head.exec(src)) {
		const start = src.indexOf("(", match.index);
		let depth = 0, finish = -1;
		for (let i = start; i < src.length; i++) { if (src[i] === "(") depth++; else if (src[i] === ")" && --depth === 0) { finish = i + 1; break; } }
		if (finish < 0) break;
		const descriptor = src.slice(start, finish); head.lastIndex = finish;
		const alias = match[1]!, key = alias.toLowerCase();
		if (seen.has(key)) continue;
		const host = /\(\s*host\s*=\s*([^()\s]+)/i.exec(descriptor)?.[1] ?? "";
		const port = Number(/\(\s*port\s*=\s*([0-9]+)/i.exec(descriptor)?.[1] ?? 0);
		const serviceName = /\(\s*service_name\s*=\s*([^()\s]+)/i.exec(descriptor)?.[1] ?? "";
		if (host && port > 0 && serviceName) { seen.add(key); out.push({ alias, host, port, serviceName }); }
	}
	return out;
}
