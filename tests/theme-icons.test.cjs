const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname,'..');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const app = fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
const theme = app.slice(app.indexOf("const THEME_KEY ="), app.indexOf('const EXPORT_DARK_VARS'));
function page(saved, dark = false){
  const attributes = {}, listeners = {}, storage = new Map(saved ? [['tp-theme', saved]] : []);
  const media = {matches:dark, addEventListener:(name,fn)=>{listeners.system=fn}};
  const select = {value:'',addEventListener:(name,fn)=>{listeners.select=fn}};
  const meta = {setAttribute:(key,value)=>{attributes.color=value}};
  const context = vm.createContext({
    window:{matchMedia:()=>media},
    document:{documentElement:{style:{},setAttribute:(key,value)=>{attributes[key]=value},getAttribute:key=>attributes[key]}},
    $:id=>id==='btnTheme'?select:meta,
    localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}
  });
  vm.runInContext(theme, context);
  return {attributes,storage,select,run:code=>vm.runInContext(code,context),
    system:value=>{media.matches=value;listeners.system()}, choose:value=>{select.value=value;listeners.select()}};
}
test('new users follow system and react live to changes',()=>{
  const p=page(undefined,true);
  assert.equal(p.select.value,'auto');
  assert.equal(p.attributes['data-theme'],'dark');
  p.system(false);
  assert.equal(p.attributes['data-theme'],'light');
  assert.equal(p.attributes.color,'#f5f5f2');
});
test('manual mode overrides system, auto restores tracking and persists choice',()=>{
  const p=page();
  p.choose('dark'); p.system(false);
  assert.equal(p.attributes['data-theme'],'dark');
  assert.equal(p.storage.get('tp-theme'),'dark');
  p.choose('auto');
  assert.equal(p.attributes['data-theme'],'light');
  assert.equal(p.storage.get('tp-theme'),'auto');
  assert.equal(p.run('themeMode'),'auto');
  assert.equal(p.run('currentTheme()'),'light');
});
test('existing explicit preferences are preserved, invalid ones use auto',()=>{
  assert.equal(page('light',true).attributes['data-theme'],'light');
  assert.equal(page('dark',false).attributes['data-theme'],'dark');
  assert.equal(page('invalid',true).select.value,'auto');
});
test('Android and Apple icon declarations point at correctly sized PNGs',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
  const icons=manifest.icons.concat([
    {src:'assets/icons/apple-touch-icon.png',sizes:'180x180'},
    {src:'assets/icons/apple-touch-icon-167.png',sizes:'167x167'},
    {src:'assets/icons/apple-touch-icon-152.png',sizes:'152x152'}
  ]);
  for(const icon of icons){
    const data=fs.readFileSync(path.join(root,icon.src.split('?')[0]));
    assert.equal(data.toString('ascii',1,4),'PNG');
    assert.equal(`${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`,icon.sizes);
  }
  assert.ok(manifest.icons.some(i=>i.purpose==='maskable' && i.src.includes('maskable')));
  assert.ok(html.includes('sizes="180x180"'));
  assert.ok(html.includes('src="./assets/icons/icon.svg?v=1.5.0"'));
});
