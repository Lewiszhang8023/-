const fs = require('fs');
const path = require('path');

const pkg = require(path.join(process.cwd(), 'package.json'));
const major = Number(process.versions.node.split('.')[0]);
const checks = [];

checks.push({
  name: 'Node.js 版本 >= 20',
  ok: major >= 20,
  detail: process.versions.node
});

checks.push({
  name: 'package.json 存在',
  ok: fs.existsSync(path.join(process.cwd(), 'package.json')),
  detail: 'package.json'
});

checks.push({
  name: 'node_modules 已安装',
  ok: fs.existsSync(path.join(process.cwd(), 'node_modules')),
  detail: 'node_modules'
});

checks.push({
  name: 'React 依赖已安装',
  ok: fs.existsSync(path.join(process.cwd(), 'node_modules/react')),
  detail: pkg.dependencies.react
});

checks.push({
  name: 'Electron 依赖已安装',
  ok: fs.existsSync(path.join(process.cwd(), 'node_modules/electron')),
  detail: pkg.devDependencies.electron
});

console.log('摄影器材设备管理 - 环境检查');
console.log('cwd:', process.cwd());
console.log('platform:', process.platform);
console.log('node:', process.versions.node);
console.log('npm package:', pkg.name, pkg.version);
console.log('');
for (const check of checks) {
  console.log(`${check.ok ? '✅' : '❌'} ${check.name} -> ${check.detail}`);
}

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.log('\n建议：');
  console.log('1. 先执行 npm install');
  console.log('2. 想先看页面就执行 npm run dev:web');
  console.log('3. 要跑桌面版再执行 npm run dev');
  process.exit(1);
}

console.log('\n环境基本正常。');
console.log('浏览器模式: npm run dev:web');
console.log('桌面模式:   npm run dev');
