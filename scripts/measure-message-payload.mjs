import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const directory = new URL("../messages/en/", import.meta.url);
function merge(a, b) {
  for (const [key,value] of Object.entries(b)) {
    if (value && typeof value === "object" && !Array.isArray(value)) a[key]=merge(a[key] ?? {},value);
    else a[key]=value;
  }
  return a;
}
const messages = readdirSync(directory).filter(f=>f.endsWith(".json"))
  .reduce((all,file)=>merge(all,JSON.parse(readFileSync(new URL(file,directory),"utf8"))),{});
const shared=Object.fromEntries(Object.entries(messages).filter(([key])=>key!=="admin"&&key!=="platform"));
for (const [name,data] of Object.entries({ previousRoot:messages, publicRoot:shared, portalTotal:{...shared,admin:messages.admin} })) {
  const value=JSON.stringify(data);
  console.log(name,JSON.stringify({bytes:Buffer.byteLength(value),gzipBytes:gzipSync(value).length}));
}
