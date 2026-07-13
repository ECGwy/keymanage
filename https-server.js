// 简单的 HTTPS 本地服务器（用于安卓 PWA 安装测试）
// Chrome 要求 PWA 必须在 HTTPS 或 localhost 上才能显示"添加到主屏幕"
//
// 安全加固：
// - 证书存放于项目根目录下的 certs/ 子目录，不进入可被 Web 访问的根
// - 请求路径经规范化并强制限制在 WEB_ROOT 内，杜绝路径遍历 (../)
// - 禁止以任何方式访问 .pem 私钥/证书文件
// - 添加基础安全响应头（CSP / X-Frame-Options 等）

const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8443;
const WEB_ROOT = __dirname;                       // 仅允许访问本目录内的静态文件
const CERT_DIR = path.join(WEB_ROOT, 'certs');    // 证书隔离在 Web 根之外

// 自签名证书（首次运行会自动生成到 certs/）
function generateCert() {
  const { execSync } = require('child_process');
  fs.mkdirSync(CERT_DIR, { recursive: true });
  console.log('正在生成自签名证书...');
  try {
    execSync(
      `openssl req -x509 -newkey rsa:2048 ` +
      `-keyout "${path.join(CERT_DIR, 'key.pem')}" ` +
      `-out "${path.join(CERT_DIR, 'cert.pem')}" ` +
      `-days 7 -nodes -subj "/CN=localhost"`,
      { stdio: 'inherit' }
    );
    console.log('证书生成成功！');
  } catch (e) {
    console.error('生成证书失败，请确保已安装 OpenSSL');
    process.exit(1);
  }
}

if (!fs.existsSync(path.join(CERT_DIR, 'cert.pem')) || !fs.existsSync(path.join(CERT_DIR, 'key.pem'))) {
  generateCert();
}

const options = {
  key: fs.readFileSync(path.join(CERT_DIR, 'key.pem')),
  cert: fs.readFileSync(path.join(CERT_DIR, 'cert.pem'))
};

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

// 安全响应头：限制资源来源，禁止被 iframe 嵌套、禁止 MIME 嗅探
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; " +
    "img-src 'self' data:; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; " +
    "script-src 'self'; " +
    "connect-src 'self'"
};

const server = https.createServer(options, (req, res) => {
  // 1) 解码并剥离查询字符串
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  // 2) 解析为绝对路径并规范化，防止 ../ 穿越
  const resolvedPath = path.normalize(path.join(WEB_ROOT, urlPath));
  if (resolvedPath !== WEB_ROOT && !resolvedPath.startsWith(WEB_ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/html' });
    res.end('<h1>403 Forbidden</h1>', 'utf-8');
    return;
  }

  // 3) 默认首页
  let filePath = resolvedPath;
  if (filePath === WEB_ROOT) filePath = path.join(WEB_ROOT, 'index.html');

  // 4) 禁止访问任何证书/私钥文件
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pem' || filePath.startsWith(CERT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/html' });
    res.end('<h1>403 Forbidden</h1>', 'utf-8');
    return;
  }

  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end('Server Error\n');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType, ...SECURITY_HEADERS });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ HTTPS 服务器已启动`);
  console.log(`📱 手机请访问: https://<电脑IP>:${PORT}`);
  console.log(`⚠️  首次访问需在手机上点击"高级"→"继续前往"信任证书`);
  console.log(`🔒 已启用路径遍历防护与私钥访问限制\n`);
});
