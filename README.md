
# nodejs-imgsCompress
这是一个用nodjs代码 进行图片压缩 的模块， 使用环境为 `nodejs`。    
原理是 将指定的图片文件自动上传到一个国外的图片压缩网站(http://www.tinypng.com), 压缩完成后再从网站上自动下载下来。  
主要是针对压缩整个目录中的图片文件，这样就不用手动的一个个去压缩了。  
   
## 获取
github仓库: [https://github.com/xiafl/nodejs-imgsCompress](https://github.com/xiafl/hx_uniapp_compontent__xfl-select) 

## 使用说明
1. 不用进行安装，直接下载 imgsCompress.js 放到需要压缩图片的目录(也可以是其它目录，但需要修改下配置)
2. 修改 文件中 第**445**行到第**471**行的配置
3. 修改完成后，打开cmd并切换到当前目录下，并执行 `node imgsCompress.js` 即可进行压缩

## 权限
无 

## 更新日志
  
2019.7.6 ***v1.0.0***  创建本模块 
