// const which = require('which');
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const exists = require('fs').existsSync; // node自带的fs模块下的existsSync方法，用于检测路径是否存在。（会阻塞）
const chalk = require('chalk'); // 用于高亮终端打印出的信息(命令行字体颜色)
const which = require('npm-which')(__dirname);
const lodash = require('lodash');
const util = require('util');
const filelist = require('./file-list');
const { rcFile } = require('rc-config-loader');

const { join } = path;

exports.logStep = function(name) {
  console.log(`${chalk.green('[ygd-scripts]')} ${chalk.magenta.bold(name)}`);
};

exports.printErrorAndExit = function(message) {
  console.error(chalk.red(message));
  process.exit(1);
};

exports.Install = function() {
  var npm = findNpm();
  this.runCmd(npm, ['install'], () => {
    this.logStep(npm + ' install end');
  });
};
// 查找系统中用于安装依赖包的命令
exports.findNpm = function() {
  var npms = ['cnpm', 'npm'];
  for (var i = 0; i < npms.length; i++) {
    try {
      // 查找环境变量下指定的可执行文件的第一个实例
      which.sync(npms[i]);
      this.logStep('use npm: ' + npms[i]);
      return npms[i];
    } catch (e) {
      console.warn(e);
    }
  }
  throw new Error(chalk.red('please install npm'));
};

/**
 * 构建多渠道
 * @param {*} params
 */
exports.runSaaSBuild = async function(params) {
  const { channelName, channelServer } = params;

  const currDomain = await this.parseDomain(params);
  this.logStep(`currDomain : ${currDomain}`);
  process.env.YG_DOMAIN = currDomain;

  process.env.YG_CHANNEL = channelName;
  process.env.UMI_ENV = 'prod';
  process.env.NODE_ENV = 'production';
  process.env.YG_ENV = channelServer;
  this.runCmd('umi', ['build'], function() {
    console.log('umi:%j build end', channelName);
  });
};

exports.parseDomain = async function(params) {
  const { channelName, channelServer } = params;
  if (channelServer !== undefined && lodash.startsWith(channelServer, 'http')) {
    // TODO: 由于新规则httpUrls根据defaultSetting的参数读取，此处先不处理跳转逻辑
    this.logStep(`http-domain=${channelServer}`);
    return channelServer;
  } else {
    if (channelServer === undefined) {
      this.printErrorAndExit('未指定环境');
    }

    // 读取rc配置
    const rcApiPrefix = await this.getRcKey('apiprefix');
    if (!!rcApiPrefix && !!rcApiPrefix.beta && !!rcApiPrefix.test) {
      // && !!rcApiPrefix[channelServer]
      if (lodash.indexOf(rcApiPrefix.beta.envs, channelServer) !== -1) {
        // ygego 单独处理www
        const tempChannelName = channelName === 'ygego' ? 'www' : channelName;
        return rcApiPrefix.beta.url
          .replace('{channelName}', tempChannelName)
          .replace('{channelServer}', channelServer);
      } else {
        return rcApiPrefix.test.url
          .replace('{channelName}', channelName)
          .replace('{channelServer}', channelServer);
      }

      // return rcApiPrefix[channelServer].replace('{channelName}',channelName).replace('{channelServer}',channelServer);
    }
    console.log(222);
    if (channelServer === 'beta' || channelServer === 'beta1') {
      return channelName === 'ygego'
        ? `http://www.ygego.${channelServer}`
        : `http://${channelName}.ygego.${channelServer}`;
    } else if (channelServer !== 'prod') {
      return `http://${channelName}.channel-desk.${channelName}.${channelServer}`;
    }
  }
};

exports.runSaaSDev = async function(params) {
  const { channelName, channelServer } = params;
  const currDomain = await this.parseDomain(params);
  this.logStep(`currDomain : ${currDomain}`);
  process.env.YG_DOMAIN = currDomain;
  process.env.YG_CHANNEL = channelName;
  process.env.YG_ENV = channelServer;
  // process.env.env=channelName;
  // process.env.PORT = 8701;
  process.env.NODE_ENV = 'development';

  // const remotePath = '/Users/fugang/workspace/xinao/channel-desk';

  // filelist.getFiles(remotePath);
  const rcCmd = await this.getRcKey('commands');
  const { dev } = rcCmd;
  if (dev === undefined) {
    this.printErrorAndExit('.ygclirc.js commands.dev not found');
  }
  if (dev === 'umi') {
    this.runCmd('umi', ['dev'], () => {
      this.logStep(`umi:${channelName} dev end`);
      // console.log('umi:%j build end', channelName);
    });
  } else {
    this.runCmd(
      'egg-bin',
      [
        'dev',
        `--port=${process.env.PORT}`,
        `--YG_ENV=${channelServer}`,
        `--YG_DOMAIN=${currDomain}`,
        `--env=${channelName}`,
      ],
      () => {
        this.logStep(`umi:${channelName} dev end`);
      }
    );
  }

  // PORT=8701 NODE_ENV=development egg-bin dev --sticky
  //  --YG_ENV=alpha --env=ygego --port=8701
};

exports.runStartLocal = async function(params) {
  const { channelName, channelServer } = params;
  process.env.NODE_ENV = 'production';
  process.env.YG_CHANNEL = channelName;
  process.env.YG_ENV = channelServer;
  //     "start": "cross-env egg-scripts start --daemon --title=portal-saas-ssr",
  //     "debug": "cross-env RM_TMPDIR=none COMPRESS=none egg-bin debug",

  await this.runCmd(
    'egg-scripts',
    [
      'start',
      '--daemon',
      `--title=${process.env.TITLE}`,
      `--YG_ENV=${channelServer}`,
      `--port=${process.env.PORT}`,
    ],
    () => {
      this.logStep(`yg egg local start: ${process.env.NODE_ENV} dev ok`);
    }
  );
};

exports.runStart = async function() {
  process.env.NODE_ENV = 'production';
  //     "start": "cross-env egg-scripts start --daemon --title=portal-saas-ssr",
  //     "debug": "cross-env RM_TMPDIR=none COMPRESS=none egg-bin debug",

  await this.runCmd(
    'egg-scripts',
    [
      'start',
      '--daemon',
      `--title=${process.env.TITLE}`,
      `--port=${process.env.PORT}`,
    ],
    () => {
      this.logStep(`yg egg deploy start: ${process.env.NODE_ENV} dev ok`);
    }
  );
};

exports.runStop = async function(fn) {
  //     "start": "cross-env egg-scripts start --daemon --title=portal-saas-ssr",
  //     "debug": "cross-env RM_TMPDIR=none COMPRESS=none egg-bin debug",
  await this.runCmd(
    'egg-scripts',
    ['stop', `--title=${process.env.TITLE}`],
    () => {
      if (fn) {
        fn();
      }
      this.logStep(`yg egg stop: ${process.env.NODE_ENV} dev ok`);
    }
  );
};

exports.runReStart = async function() {
  //     "start": "cross-env egg-scripts start --daemon --title=portal-saas-ssr",
  //     "debug": "cross-env RM_TMPDIR=none COMPRESS=none egg-bin debug",
  await this.runStop(() => {
    this.runStart();
  });
};

// 开启子进程来执行npm install命令
exports.runCmd = async function(cmdName, args, fn) {
  args = args || [];

  // How to sync node_modules with actual package.json?
  // If your new branch has new npm packages or updated version dependencies, just run $ npm install again after switching branches.
  const cmd = await which.sync(cmdName, { nothrow: true });
  this.logStep(cmd, '----cmd');
  if (!cmd) {
    this.logStep(`not found: ${cmdName}`);
    return;
  }

  var runner = childProcess.spawn(cmd, args, {
    stdio: 'inherit',
    env: process.env,
  });

  await runner.on('close', function(code) {
    if (fn) {
      fn(code);
    }
  });
};

exports.parseArg = function(opt) {
  const { channel, server, channelserver, type } = opt;
  const f = channel !== undefined;
  const arr_channel =
    !!channelserver && channelserver.indexOf(':') !== -1
      ? channelserver.split(':')
      : [];
  const channelName = f ? channel : arr_channel[0];

  let channelServer = f ? server : arr_channel[1];
  if (!!channelServer && channelServer.indexOf('http') !== -1) {
    channelServer = channelserver.substring(channelName.length + 1);
  }
  this.logStep('当前正在准备编译环境...');

  if (channelName !== undefined && channelServer !== undefined) {
    return { channelName, channelServer, type };
  }
  return undefined;
};

/**
 * 加载yg-cli 配置文件
 * @param {*} rcFileName
 */
exports.loadRcFile = async function(rcFileName) {
  var that = this;
  try {
    const results = await rcFile(rcFileName);

    if (!results) {
      that.printErrorAndExit('.ygclirc.js not found');
    }
    return results.config;
  } catch (error) {
    // Found it, but it is parsing error
    that.printErrorAndExit('.ygclirc.js not found');
  }
};

exports.getRcKey = async function(key) {
  const cliRc = await this.loadRcFile('ygcli');
  return cliRc[key];
};
/**
 * 按指定环境 通常由build与dev 指定
 * 更新代码中的配置变量
 * build 会分为多saas渠道
 * @param {*} opt
 */
exports.updateSettings = async function(opt) {
  // const cliRc = this.loadRcFile('ygcli');
  // const { path: someFile } = cliRc.envfile;
  const { path: someFile } = await this.getRcKey('envfile');
  if (someFile === undefined) {
    this.printErrorAndExit('.ygclirc.js envfile.path not found');
  }
  const readFile = util.promisify(fs.readFile);
  const writeFile = util.promisify(fs.writeFile);
  const existFile = await this.isFileSync(someFile);

  let setting = null;
  if (!existFile) {
    setting = { channelName: 'ygego', channelServer: 'alpha' };
  } else {
    await readFile(someFile).then(
      data => {
        setting = JSON.parse(data.toString());
      },
      err => {
        console.error(err);
      }
    );
  }
  if (setting) {
    // setting[opt.key] = opt.value; //定义

    lodash.forIn(opt, (value, key) => {
      setting[key] = value; //重新赋值
      this.logStep(`success write setting : ${key}=${value}`);
    });

    const result = JSON.stringify(setting);

    await writeFile(someFile, result).then(
      data => {
        this.logStep(`success write setting.${data}`);
      },
      err => {
        console.error(err);
      }
    );
  }
};

/**
 * 校验输入参数
 * @param {*} params
 */
exports.checkArgs = function(params) {
  const { channelName, channelServer } = params;
  this.logStep(`channelName : ${channelName}`);
  this.logStep(`serverName : ${channelServer}`);

  // return;
  if (!channelName && !channelServer) {
    this.printErrorAndExit('please input  channelName and serverName');
  }
};

exports.isFileSync = async function(aPath) {
  try {
    const res = await fs.statSync(aPath).isFile();
    return res;
  } catch (e) {
    if (e.code === 'ENOENT') {
      return false;
    }
    throw e;
  }
};