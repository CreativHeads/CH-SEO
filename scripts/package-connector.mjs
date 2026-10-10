import fs from 'node:fs';
import PHP from 'php-parser';
const source=fs.readFileSync('wp-connector/ch-seo-connector.php','utf8');
new PHP({parser:{suppressErrors:false,version:'7.4'}}).parseCode(source,'ch-seo-connector.php');
// A single-file ZIP using the standard uncompressed method; no system ZIP program needed on Windows.
const name=Buffer.from('ch-seo-connector/ch-seo-connector.php'),body=Buffer.from(source);let crc=0xffffffff;for(const byte of body){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}crc=(crc^0xffffffff)>>>0;
const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt32LE(crc,14);header.writeUInt32LE(body.length,18);header.writeUInt32LE(body.length,22);header.writeUInt16LE(name.length,26);
const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(body.length,20);central.writeUInt32LE(body.length,24);central.writeUInt16LE(name.length,28);
const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(header.length+name.length+body.length,16);
fs.mkdirSync('downloads',{recursive:true});fs.writeFileSync('downloads/ch-seo-connector.zip',Buffer.concat([header,name,body,central,name,end]));console.log('WordPress connector syntax checked and packaged.');
