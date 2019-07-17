
const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

initColorLog();

//*************************************** 模拟 web storage ************************************ */
/**
 * 模拟 web storage
 * 数据存储存在指定的文件中
 * v1.0.0
 * 最后修改: 2019.7.17
 * 创建: 2019.7.17
 */
class LocalStorage {
  /**
   * @param {*} fileName 
   * @param {string} storeType - 存储的类型 'file' 表示存储到本地文件中 'cache' 表示存储在内存中
   */
  constructor(storeType = 'file', fileName = '.localStorage' ) {
    this.fileName = fileName;
    this.storeType = storeType;
    this.store = this.getStoreObj(this.fileName) || { length: 0};
  }
  get length(){
    return this.store.length;
  }
  setItem(name, val) {  //存储一个值
    if (!(name in this.store)) {
      this.store.length++;
    }
    const oldVal = this.store[name];
    this.store[name] = val;
    if (oldVal !== val) {
      this.addUpdateTime(this.store);
      this.setToStore(this.fileName, this.store);
    }
  }
  getItem(name) { // 取值
    return this.store[name];
  }
  removeItem(name) { //删除
    if (name in this.store) {
      this.store.length--;
    }
    delete this.store[name];
    this.addUpdateTime(this.store);
    this.setToStore(this.fileName, this.store);
  }
  clear() { // 清空
    this.store = { length: 0};
    this.addUpdateTime(this.store);
    this.setToStore(this.fileName, this.store);
  }
  key(name){ //返回存储时的索引
    return 0;
  }

  addUpdateTime(obj){ // 添加更新时间
    obj.__lastUpdate = new Date().toLocaleString();
  }

  getStoreObj(fileName) { //从文件中读取
    if(this.storeType !== 'file'){
      return;
    }
    let obj;
    try {
      let data = fs.readFileSync(fileName); // 同步读取
      obj = JSON.parse(data.toString());
    } catch (e) { 
      // console.error('读取文件错误！', e) 
    }
    return obj;
  }
  setToStore(fileName, obj = { length: 0 }) {
    if(this.storeType !== 'file'){
      return;
    }
    // 如果不存在文件，就会新建一个，如果已经存在，就会被覆盖
    fs.writeFile(fileName, JSON.stringify(obj), function(err){// 异步写入
        if(err){
          // console.log('写入文件错误！', err);
        }
    }); 
  }
}
//*************************************** 模拟 web storage ************************************ */

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
 * 转换规则的格式, 返回新的规则数组，不改变原数组
 * @public
 * @param {Array} rulesArr - 规则的原始数组
 * @param {Object} obj.before - 转换之前 before(val) 
 *                              返回 false表示忽略本条规则， 返回字符串或正则 表示使用这个值替换原来的值
 * @param {Object} obj.after - 转换之后 after(newVal, val)
 *                              返回 false表示忽略本条规则， 返回非空值 表示使用这个值替换原来的值
 * @returns {Array} 转换后的规则数组
 * @example
 * 1. formatRules([/aaa\/bb.mp4/ig, 'aaa.mp3', '** /bb.js', '?c.js']);
 * // => [/aaa\/bb.mp4/ig, 'aaa.mp3', /^[^\n\\\/]*\/bb\.js$/ig, /^[^\n\\\/]c\.js$/ig ]
 */
function formatRules(rulesArr, {before=null, after=null}) {
  let arr = [];
  if(!Array.isArray(rulesArr)){
    return arr;
  }
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

    newVal = specialSignToReg(newVal, 'ig');
    
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
 * 如果字符串中有特殊字符 * ?，则将其转换为正则表达式
 * 转换的方式为: 
 * 1. 默认只处理其中的字符串，不会处理正则表达式
 * 2. 字符串中的两个\*号表示除了/\之外的其它任意个字符 一个\*号表示任意数量的字符
 * 3. 一个?号表示 除了/\之外的其它单个字符
 * 4. 只要含有星号或问题，则表示忽略大小写
 * @public
 * @param {any} value - 要转换的字符串
 * @param {boolean} isIgnore - 创建的正则表达式是否忽略大小写
 * @example
 * 1. specialSignToReg('*.mp3');
 * // => /[^\\n]*\.mp3/ig
 * 
 * 2. specialSignToReg('aa/bb?c/**.mp3');
 * // => /aa/bb[^\\n]c\/\.mp3/ig
 */
function specialSignToReg(value, mark = ''){
  if ( typeof value === 'string' ) { //只处理字符串
    let isReg = false;
    if (value.includes('*')) {
      isReg = true;
      value = value.replace('**', '[^\\n\\\\\/]*').replace('*', '[^\\n]*')
    }
    if (value.includes('?')) {
      isReg = true;
      value = value.replace('?', '[^\\n\\\\\/]');
    }

    if (isReg) {
      value = value.replace('.', '\\.').replace('/', '\\/').replace('\\', '\\\\');
      value = new RegExp(`^${value}$`, mark ? mark : 'g');
    }
  }
  return value;
}

/**
 * 测试指定值否在某个规则集中
 * @public
 * @param {String} testVal  - 要测试的值
 * @param {Array} [rulesArr=null] - 规则数组 
 *                                  [
 *                                      {rule: 'aa.js'}, //如果是一个普通对象，则取其rule作为规则
 *                                      function(){retrun 'aa.js';}, //如果是一个函数，则取其返回值作为规则
 *                                      'aa.js',    //普通的字符串，使用全等进行比较
 *                                      /aa\.js/ig, //使用正则进行测试
 *                                      undefined, //如果是undefined，则表示没有规则，立即通过本项测试
 *                                  ]
 * @param {String} [type='some'] - 测试的类型 
 *  'some': 只要指定的值满足其中的一条规则就算满足, 一旦满足就不再检测其它规则了 
 *  'every':  指定的值必须满足其中所有规则才算满足
 * @returns {Boolean|null} 布尔值表示在或不在，null表示未知
 */
function isMatchRule(testVal, rulesArr = null, type = 'some') {
  if (!Array.isArray(rulesArr) || rulesArr.length === 0) {
    return null;
  }
  return rulesArr[type](
    val => {
      if(val === undefined){
        return true;
      }else{
        if(typeof val === 'object' && !(val instanceof RegExp) ){
          val = val.rule;
        }else if(typeof val === 'function'){
          val = val();
        }
        if(val === undefined){
          return true;
        }
        return val instanceof RegExp ? val.test(testVal) : testVal === val;
      }
    }
  );
}

//---------------------- 匹配路径的算法 ----------------------

//---------------------- libs ----------------------

/**
 * 获取目录中的文件和文件夹列表
 * @param {string} folder - 完整的路径(如果是文件，则包含扩展名)
 */
function readdir(folder) {
  return new Promise((resolve, reject) => {
    fs.readdir(folder, (err, files) => {
      err ? reject(err) : resolve(files);
    });
  });
}

/**
 * 获取文件或目录信息
 * @param {string} file  - 完整的路径(如果是文件，则包含扩展名)
 */
function stat(file) {
  return new Promise((resolve, reject) => {
    fs.stat(file, (err, stats) => {
      err ? reject(err) : resolve(stats);
    });
  });
}

/**
 * 判断一个字符串或正则是否是匹配一个文件(不是文件的话就是目录)
 * 注意，结果不一定完全正确，因为'aa.mp3' 也可以是一个文件夹
 * @param {string|RegExp} val - 要判断的字符串或正则
 * @returns {boolean} 
 * @example
 * 1. isMathFile('.mp3');  // => true
 * 2. isMathFile(/\.mp3/ig);  // => true
 * 3. isMathFile(/mp3\/aa/ig);  // => false
 * 4. isMathFile('aaa/bb/cc');  // => false
 * 5. isMathFile(/[abc]{2}\.(mp3|js)/);  // => true
 */
function isMathFile(val){
  let isFile = false, str = val;
  if(val instanceof RegExp){ // 因为使用正则来匹配文件的方式写法很多，这里只是简单的进行判断
    // /aa/ig.toString(); ==> "/aa/gi"
    str = val.toString().replace(/(^\/)|(\/[iIgGmM]{0,3}$)/g, ''); // 去掉头尾的斜杠   "/.*\.jpg/" ==> ".*\.jpg"
    // 注意，这种判断并不是特别准确
    isFile = /\\\.[^\n\\\/\.]+\$/.test(str);   // 以 \.xxx 这种结尾

  }else{
    isFile = /\.[^\n\\\/\.]*\s*$/.test(str);  // 以 .xxx 这种结尾
  }
  return isFile;
}

//---------------------- libs ----------------------

//******************************* 根据规则获取文件或目录 *********************************************




//******************************* 在cmd控制台上有颜色的输出 *********************************************
function initColorLog() {
  let { log, warn, error } = console;
  console.log = (...agrs) => { colorLog(null, ...agrs) };
  console.warn = (...agrs) => { colorLog('$yellow', ...agrs) };
  console.error = (...agrs) => { colorLog('$red', ...agrs) };

  let styles = {
    'bold': ['\x1B[1m', '\x1B[22m'],          // 粗体字
    'italic': ['\x1B[3m', '\x1B[23m'],        // 斜体字
    'underline': ['\x1B[4m', '\x1B[24m'],     // 下划线
    'inverse': ['\x1B[7m', '\x1B[27m'],       // 切换背景与前景色
    'strikethrough': ['\x1B[9m', '\x1B[29m'], //删除线

    'black': ['\x1B[30m', '\x1B[39m'], // 黑色
    'white': ['\x1B[37m', '\x1B[39m'], // 白色
    'grey': ['\x1B[90m', '\x1B[39m'],  // 灰色

    'red': ['\x1B[31m', '\x1B[39m'],   // 红色
    'green': ['\x1B[32m', '\x1B[39m'], // 绿色
    'blue': ['\x1B[34m', '\x1B[39m'],  // 蓝色

    'yellow': ['\x1B[33m', '\x1B[39m'],   // 黄色 =（红）+（绿）
    'magenta': ['\x1B[35m', '\x1B[39m'],  // 紫红色 洋红色 品红色 =（红）+（蓝）
    'cyan': ['\x1B[36m', '\x1B[39m'],     // 蓝绿色 青色  = （蓝）+（绿）

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

  let styleReg = getStyleFlagReg(); // 例如: /\$(red|green|blue)/

  /**
   * 插入
   * @param {Array<String>} regResultArr - 颜色数组 如 : ['red', 'greenBg']
   * @param {String} str - 要输出的字符串  
   * @returns {String} 添加颜色后的字符串
   * @example
   * 1. insertColorStr(['red', 'greenBg'], '小明');
   * // => '\x1B[31m \x1B[42m 小明 \x1B[49m \x1B[39m'
   */
  function insertColorStr(regResultArr, str) {
    if (!regResultArr) {
      return str;
    }
    let markStr = '__inner_20190704171233103__';
    let result = markStr;
    for (let i = 0, colorName; i < regResultArr.length; i++) {
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
      // regResultArr = ['red', 'greenBG']
      regResultArr = typeof val == 'string' ? val.match(styleReg) : null;
      if (regResultArr) {
        if (fixedColor) {
          regResultArr.forEach(val => {
            if (!fixedColor.includes(val)) {
              regResultArr.unshift(val);
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
//******************************* 在cmd控制台上有颜色的输出 *********************************************


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
        console.log('$blue',
          `压缩成功 [${imgpath}]，原始大小 ${BToKB(obj.input.size)}KB，压缩后大小 ${
          BToKB(obj.output.size)
          }KB，体积减小了 ${toPercent(1 - obj.output.ratio, 1)}`
        );
        
        storage.setItem(imgpath, obj.output.size); // 将压缩信息存到本地文件中
        
      });
    });
  });
  req.on('error', e => {
    console.error(e);
  });
  req.end();
}

//---------------------- libs ----------------------
function BToKB(size, dotNum = 0) {
  return (size / 1000).toFixed(dotNum);
}
function toPercent(num, dotNum = 2) {
  return (num * 100).toFixed(dotNum) + '%';
}
//---------------------- libs ----------------------

// module.exports = Files;
//*******************************业务逻辑  上传和下载 *********************************************

const storage = new LocalStorage();

const filesList = new Files({
  root: './',
  // 缩小 root 指定的目录范围
  include: [ // 两个**表示所有字符 一个*表示除了/和\的其它字符 ?表示一个非 / \ 字符
    '**.jpg', '**.png',  '**.jpeg',
  ],
  // 排除某些目录或文件
  exclude: [
    './bbb',
  ],
  /**
   * 每确定一个文件或目录时调用
   * @param {String} type - 路径对应的类型 'File' 表示是一个文件 'Dir' 表示是一个目录
   * @param {String} fullName - 包括文件名及其扩展名的完整路径
   * @param {Object} stats - 对应文件或目录的状态信息
   */
  resultCallback(type, fullName, stats){
    if(type === 'File'){
      fileUpload(fullName); // 自动上传和下载
    }
  },
  // ignoreCallback(type, fullName, stats){ //每忽略一个文件或目录时调用
  //   console.warn('忽略了:::::::::::::::::::::', fullName);
  // },

  // 过滤器，获取到文件或目录后，再决定是否可以通过
  // 返回 true 表示被过滤了(没有验证通过)，返回其它值，表示目录或文件没有被过滤掉(认为需要进行压缩)
  filter: [
    function(type, fullName, stats){  
      if(type === 'File'){
        const size = storage.getItem(fullName);
        if(size && Math.abs(stats.size - size) < 1000){ // 相差不足1kb，就不压缩
          return true;
        }
      }
    }, 
    function(type, fullName, stats){  
      if(type === 'File'){
        let result = stats.size <= 5200000; // 小于5M
        return !result;
      }
    }, 
  ],
});

filesList.start();  // 开始压缩

