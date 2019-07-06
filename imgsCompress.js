
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

colorLog();

//******************************* libs *********************************************
function BToKB(size, dotNum = 0) {
  return (size / 1000).toFixed(dotNum);
}
function toPercent(num, dotNum = 2) {
  return (num * 100).toFixed(dotNum) + '%';
}
//******************************* libs *********************************************



//******************************* 根据规则获取文件或目录 *********************************************

function Files(config){
  let defaultConfig = {
    root: '.' + path.sep ,
    include: '',
    exclude: '',
    ignoreCallback(type, fullName, stats){ //每忽略一个文件或目录时调用
      console.warn('忽略了:::::::::::::::::::::', fullName);
    },
    resultCallback(type, fullName, stats){ //每确定一个文件或目录时调用
      console.log('通过了', fullName);
    },
    filter(type, fullName, stats){  // 过滤器，获取到文件或目录后，再决定是否可以通过
      if(type === 'File'){
        let result = stats.size <= 5200000; // 小于5M
        return !result;
      }
    }, 
  }
  this.init( Object.assign(defaultConfig, config) );
}

Files.prototype.init = function(config){
  let processRule = (type = 'all')=>{
    return (val)=>{
      val = path.normalize(config.root + path.sep + val); //保证所有的路径都在一个指定的根目录下
      if(type === 'all'){
        return val;
      }else{
        if(type === 'file'){
          return isMathFile(val) ? val : false;
        }else{
          return isMathFile(val) ? false : val;
        }
      }
    }
  }
  config.includeFile = formatRules(config.include, {before: processRule('file')});
  config.includeDir = formatRules(config.include, {before: processRule('dir')});
  config.excludeFile = formatRules(config.exclude, {before: processRule('file')});
  config.excludeDir = formatRules(config.exclude, {before: processRule('dir')});
  this.config = config;
}

// 开始
Files.prototype.start = function (root) {
  root = this.config.root || root || '.' + path.sep ;
  if (Array.isArray(root)) {
    root.forEach(val => {
      this.fileList(val);
    });
  } else {
    this.fileList(root);
  }
};

// 遍历文件列表
Files.prototype.fileList = function (folder) {
  let config = this.config;
  let getFilesFromDir = config.readdir || readdir;
  return getFilesFromDir(folder).then((files) => {
    files.forEach(file => {
      this.everyFile( path.normalize(folder + file) );
    });
  })
}

/*
fullName 的可能值
"./taa/mmexport1557546330378.jpg"
"./taa"
"./mmexport1557546330378.png"
"./test.js"
*/
Files.prototype.everyFile = function (fullName) {
  let config = this.config;
  let getFileInfo = config.fileInfo || stat;
  getFileInfo(fullName)
    .then(stats => {
      let type = stats.isFile() ? 'File' : 'Dir';

      if( 
        this.filterStatic(type, fullName, stats, config)  ||
        this.filterDynic(type, fullName, stats, config)
      ){
        return;
      }
      typeof config.resultCallback === 'function' &&  config.resultCallback(type, fullName, stats);

      type === 'Dir' && this.fileList(fullName + path.sep);
    })
    .catch(err => {
      console.error(err);
    });
}

// 静态过滤器， 只有当返回 true 时，才表示被过滤了(没有通过验证)
Files.prototype.filterStatic = function (type, fullName, stats, config){
  let isInclude = isMatchRule(fullName, config['include' + type]);
  if (isInclude === null ? false : !isInclude) {
    typeof config.ignoreCallback === 'function' && config.ignoreCallback(type, fullName, stats);
    return true;
  }
  let isExclude = isMatchRule(fullName,  config['exclude' + type]);
  if (isExclude === null ? false : isExclude) {
    typeof config.ignoreCallback === 'function' && config.ignoreCallback(type, fullName, stats);
    return true;
  }
  return false;
}

// 动态过滤器， 只有当返回 true 时，才表示被过滤了(没有通过验证)
Files.prototype.filterDynic = function (type, fullName, stats, {filter, ignoreCallback}){
   if(!filter){
    return false;
   }
   if( Array.isArray(filter) && filter.length > 0 ){
      return filter.some((filter)=>{
        if(typeof filter === 'function' &&  filter(type, fullName, stats) === true){
          typeof ignoreCallback === 'function' && ignoreCallback(type, fullName, stats);
          return true;
        }
      });
   }else{
      if(typeof filter === 'function' &&  filter(type, fullName, stats) === true){
        typeof ignoreCallback === 'function' && ignoreCallback(type, fullName, stats);
        return true;
      }
   }
  
   return false;
}


//---------------------- 匹配路径的算法 ----------------------

/**
 * 转换规则的格式
 * /aaa/* /*bbb.mp3
 * @param {Array} rulesArr - 规则的原始数组
 * @returns {Array} 转换后的规则数组
 */
function formatRules(rulesArr, {before, after}) {
  if(!Array.isArray(rulesArr)){
    return;
  }
  let arr = [];
  rulesArr.forEach(val => {
    let newVal = val;
    
    if( typeof before === 'function' ){
      let result = before(val);
      if(result === false){
        return;
      }else if(typeof result === 'string' || result instanceof RegExp){
        val = newVal;
        newVal = result;
      }
    }
    if ( !(newVal instanceof RegExp) ) { //不处理正则
      let isReg = false;
      if (newVal.includes('*')) {
        isReg = true;
        newVal = val.replace('**', '[^\\n\\\\\/]*').replace('*', '[^\\n]*')
      }
      if (newVal.includes('?')) {
        isReg = true;
        newVal = val.replace('?', '[^\\n\\\\\/]*');
      }

      if (isReg) {
        newVal = new RegExp(`^${newVal}$`, 'i');
      }
    }
    
    if( typeof after === 'function' ){
      let result = after(newVal, val);
      if(result === false){
        return;
      }else if(result){
        newVal = result;
      }
    }
    arr.push(newVal);
  });
  return arr;
}

/**
 * 测试指定值否在某个规则集中
 * @param {String} testVal  - 要测试的值
 * @param {Array} [rulesArr=null] - 规则数组 
 * @param {String} [type='some'] - 测试的类型 
 *  'some': 只要指定的值满足其中的一条规则就算满足 
 *  'every':  指定的值必须满足其中所有规则才算满足
 * @returns {Boolean|null} 布尔值表示在或不在，null表示未知
 */
function isMatchRule(testVal, rulesArr = null, type = 'some') {
  if (!Array.isArray(rulesArr) || rulesArr.length === 0) {
    return null;
  }
  return rulesArr[type](
    val => {
      if(!val){
        return true;
      }else{
        if(typeof val === 'object' && !(val instanceof RegExp) ){
          val = val.rule;
        }else if(typeof val === 'function'){
          val = val();
        }
        if(!val){
          return true;
        }
        return val instanceof RegExp ? val.test(testVal) : testVal === val;
      }
    }
  );
}

//---------------------- 匹配路径的算法 ----------------------

//---------------------- libs ----------------------

// 获取文件列表
function readdir(folder) {
  return new Promise((resolve, reject) => {
    fs.readdir(folder, (err, files) => {
      err ? reject(err) : resolve(files);
    });
  });
}

//获取文件信息
function stat(file) {
  return new Promise((resolve, reject) => {
    fs.stat(file, (err, stats) => {
      err ? reject(err) : resolve(stats);
    });
  });
}

//判断一个字符串或正则是否是匹配一个文件(不是文件的话就是目录)
function isMathFile(val){
  let isFile = false, str = val;
  if(val instanceof RegExp){
    str = val.toString().replace(/(^\/)|(\/$)/g, ''); //  "/.*\.jpg/" ==> ".*\.jpg"
    isFile = /\\\.[^\n\\\/\.]+\$/.test(str);   // 以 \.xxx 这种结尾
  }else{
    isFile = /\.[^\n\\\/\.]+$/.test(str);  // 以 .xxx 这种结尾
  }
  return isFile;
}

//---------------------- libs ----------------------

//******************************* 根据规则获取文件或目录 *********************************************



//******************************* 在控制台上有颜色的输出 *********************************************
function colorLog() {
  let { log, warn, error } = console;
  console.log = (...agrs) => { colorLog(null, ...agrs) };
  console.warn = (...agrs) => { colorLog('$yellow', ...agrs) };
  console.error = (...agrs) => { colorLog('$red', ...agrs) };

  let styles = {
    'bold': ['\x1B[1m', '\x1B[22m'],
    'italic': ['\x1B[3m', '\x1B[23m'],
    'underline': ['\x1B[4m', '\x1B[24m'],
    'inverse': ['\x1B[7m', '\x1B[27m'],
    'strikethrough': ['\x1B[9m', '\x1B[29m'],
    'white': ['\x1B[37m', '\x1B[39m'],
    'grey': ['\x1B[90m', '\x1B[39m'],
    'black': ['\x1B[30m', '\x1B[39m'],
    'blue': ['\x1B[34m', '\x1B[39m'],
    'cyan': ['\x1B[36m', '\x1B[39m'],
    'green': ['\x1B[32m', '\x1B[39m'],
    'magenta': ['\x1B[35m', '\x1B[39m'],
    'red': ['\x1B[31m', '\x1B[39m'],
    'yellow': ['\x1B[33m', '\x1B[39m'],
    'whiteBG': ['\x1B[47m', '\x1B[49m'],
    'greyBG': ['\x1B[49;5;8m', '\x1B[49m'],
    'blackBG': ['\x1B[40m', '\x1B[49m'],
    'blueBG': ['\x1B[44m', '\x1B[49m'],
    'cyanBG': ['\x1B[46m', '\x1B[49m'],
    'greenBG': ['\x1B[42m', '\x1B[49m'],
    'magentaBG': ['\x1B[45m', '\x1B[49m'],
    'redBG': ['\x1B[41m', '\x1B[49m'],
    'yellowBG': ['\x1B[43m', '\x1B[49m'],
  };
  function getStyleFlagReg() {
    let styleNames = [];
    for (let prop in styles) {
      styleNames.push(prop);
    };

    let str = '\\$(' + styleNames.join('|') + ')';
    return new RegExp(`^\\s*${str}(?:\\s*,\\s*${str})*\\s*$`);
  }

  let styleReg = getStyleFlagReg();

  function insertColorStr(regResultArr, str) {
    if (!regResultArr) {
      return str;
    }
    let markStr = '__inner_20190704171233103__';
    let result = markStr;
    for (let i = 1, colorName; i < regResultArr.length; i++) {
      colorName = regResultArr[i];
      if (styles[colorName]) {
        result = result.replace(markStr, styles[colorName].join(markStr));
      }
    }
    return result.replace(markStr, str);
  }

  function colorLog(fixedColor, ...args) {
    let result = [];
    fixedColor = typeof fixedColor == 'string' ? fixedColor.match(styleReg) : null;
    for (let i = 0, val, regResultArr, lastRegResultArr = fixedColor; i < args.length; i++) {
      val = args[i];
      regResultArr = typeof val == 'string' ? val.match(styleReg) : null;
      if (regResultArr) {
        if (fixedColor) {
          regResultArr.forEach(val => {
            if (!fixedColor.includes(val)) {
              regResultArr.push(val);
            }
          });
        }
        lastRegResultArr = regResultArr;
      } else {
        result.push(insertColorStr(lastRegResultArr, val));
      }
    }

    log(...result);
  }
};
//******************************* 在控制台上有颜色的输出 *********************************************


//*******************************业务逻辑 上传和下载 *********************************************

const options = {
  method: 'POST',
  hostname: 'tinypng.com',
  path: '/web/shrink',
  headers: {
    'rejectUnauthorized': false,
    'Postman-Token': Date.now(),
    'Cache-Control': 'no-cache',
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36'
  }
};

// 异步上传图片到服务器，由服务器压缩图片
function fileUpload(fullName) {
  console.log('$green', '开始上传图片 ', '$green', fullName);
  var req = https.request(options, function (res) {
    res.on('data', buf => {
      let obj = JSON.parse(buf.toString());
      // 失败后的数据 {"error":"Bad request","message":"Request is invalid"}
      if (obj.error) {
        console.error(`[${fullName}]：压缩失败！报错：${obj.message}`);
      } else {
        /* { //成功后的数据
            "input": { "size": 887, "type": "image/png" },
            "output": { 
                "size": 785, 
                "type": "image/png", 
                "width": 81, 
                "height": 81, 
                "ratio": 0.885, 
                "url": "https://tinypng.com/web/output/7aztz90nq5p9545zch8gjzqg5ubdatd6" 
                }
            }
        */
        fileUpdate(fullName, obj);
      }
    });
  });

  req.write(fs.readFileSync(fullName), 'binary'); // 读取本地文件
  req.on('error', e => {
    console.error(e);
  });
  req.end(); // 发送消息
}

// 从服务器中下载压缩后的图片数据
function fileUpdate(imgpath, obj) {
  let options = new URL(obj.output.url);
  let req = https.request(options, res => {
    let body = '';
    res.setEncoding('binary');
    res.on('data', function (data) {
      body += data;
    });

    res.on('end', function () {
      fs.writeFile(imgpath, body, 'binary', err => {
        if (err) return console.error(err);
        console.log('$blue, $whiteBG',
          `压缩成功 [${imgpath}]，原始大小 ${BToKB(obj.input.size)}KB，压缩后大小 ${
          BToKB(obj.output.size)
          }KB，压缩比例 ${toPercent(1 - obj.output.ratio, 1)}`
        );
      });
    });
  });
  req.on('error', e => {
    console.error(e);
  });
  req.end();
}

// module.exports = Files;
//*******************************业务逻辑  上传和下载 *********************************************


let filesList = new Files({
  root: './',
  include: [
    '**.jpg', '**.png',  '**.jpeg',
  ],
  exclude: [
    './bbb',
  ],
  resultCallback(type, fullName, stats){ //每确定一个文件或目录时调用
    if(type === 'File'){
      fileUpload(fullName); // 自动上传和下载
    }
  },
  // ignoreCallback(type, fullName, stats){ //每忽略一个文件或目录时调用
  //   console.warn('忽略了:::::::::::::::::::::', fullName);
  // },
  filter(type, fullName, stats){  // 过滤器，获取到文件或目录后，再决定是否可以通过
    if(type === 'File'){
      let result = stats.size <= 5200000; // 小于5M
      return !result;
    }
  }, 
});

filesList.start();  // 开始压缩