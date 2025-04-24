export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  }
}

async function handleRequest(request, env) {
  const PASSWORD = env.PASSWORD;
  const url = new URL(request.url);
  const queryPassword = url.searchParams.get("password");

  // 特别检测：如果是 uptime 检查路径，直接返回 OK
  if (url.pathname === "/uptime-check") {
    return new Response("OK", { status: 200 });
  }

  // 提取路径中的目标网址
  let actualUrlStr = url.pathname.slice(1);
  actualUrlStr = decodeURIComponent(actualUrlStr);

  // 校验密码
  if (queryPassword !== PASSWORD) {
    return new Response(`
      <html>
      <head>
        <title>密码验证 | Password Required</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #f0f2f5;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          .card {
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            max-width: 400px;
            width: 90%;
            text-align: center;
          }
          input[type="password"] {
            width: 100%;
            padding: 12px;
            margin: 10px 0;
            border-radius: 8px;
            border: 1px solid #ccc;
            font-size: 16px;
          }
          button {
            padding: 12px;
            width: 100%;
            border: none;
            border-radius: 8px;
            background-color: #007bff;
            color: white;
            font-size: 16px;
            cursor: pointer;
          }
          button:hover {
            background-color: #0056b3;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>请输入密码以访问代理服务</h2>
          <h4>Please enter password to access the proxy</h4>
          <input type="password" id="pwd" placeholder="Password" />
          <button onclick="submitPassword()">进入 / Go</button>
        </div>
        <script>
          function submitPassword() {
            const pwd = document.getElementById('pwd').value.trim();
            const currentPath = location.pathname.slice(1);
            if (pwd) {
              const target = currentPath ? '/' + currentPath + '?password=' + encodeURIComponent(pwd) : '/?password=' + encodeURIComponent(pwd);
              location.href = target;
            }
          }
        </script>
      </body>
      </html>
    `, {
      status: 401,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // 如果没有目标网址，显示首页
  if (!actualUrlStr) {
    const mainDomain = url.hostname;
    const websiteTitle = "Quick Proxy";
    return new Response(`
      <html>
      <head>
        <title>${websiteTitle}</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: 'Segoe UI', sans-serif;
            background: linear-gradient(to right, #c9d6ff, #e2e2e2);
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
          }
          #container {
            background: #fff;
            padding: 30px;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            width: 100%;
            max-width: 480px;
            text-align: center;
          }
          h1 {
            color: #333;
            margin-bottom: 20px;
          }
          input[type="text"] {
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            width: 100%;
            margin-bottom: 15px;
            font-size: 16px;
          }
          input[type="button"] {
            padding: 12px;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 6px;
            width: 100%;
            cursor: pointer;
            transition: background-color 0.2s ease;
          }
          input[type="button"]:hover {
            background-color: #0056b3;
          }
        </style>
      </head>
      <body>
        <div id="container">
          <h1>${websiteTitle}</h1>
          <p>输入需要代理的网站（Enter the website to be represented）:</p>
          <input type="text" id="url" placeholder="例如：https://github.com/" />
          <input type="button" id="submit" value="进入代理（Go to Agent）" onclick="redirectToProxy()" />
          <script>
            function redirectToProxy() {
              const urlInput = document.getElementById('url');
              const inputUrl = urlInput.value.trim();
              const pwd = "${queryPassword || ''}";
              if (inputUrl) {
                const fullUrl = inputUrl.startsWith("http") ? inputUrl : "https://" + inputUrl;
                window.open("/" + fullUrl + "?password=" + encodeURIComponent(pwd), "_blank");
              }
            }
          </script>
        </div>
      </body>
      </html>
    `, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // 清除 cf-* header
  let newHeaders = new Headers();
  for (let pair of request.headers.entries()) {
    if (!pair[0].startsWith('cf-')) {
      newHeaders.append(pair[0], pair[1]);
    }
  }

  const modifiedRequest = new Request(actualUrlStr, {
    headers: newHeaders,
    method: request.method,
    body: request.body,
    redirect: 'manual'
  });

  try {
    const response = await fetch(modifiedRequest);
    let modifiedResponse;
    let body = response.body;

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = new URL(response.headers.get('location'));
      const modifiedLocation = "/" + encodeURIComponent(location.toString()) + "?password=" + encodeURIComponent(PASSWORD);
      modifiedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText
      });
      modifiedResponse.headers.set('Location', modifiedLocation);
    } else {
      if (response.headers.get("Content-Type")?.includes("text/html")) {
        const originalText = await response.text();
        const regex = /((href|src|action)=["'])\/(?!\/)/g;
        const modifiedText = originalText.replace(
          regex,
          `$1${url.protocol}//${url.host}/${encodeURIComponent(new URL(actualUrlStr).origin + "/")}`
        );
        body = modifiedText;
      }
      modifiedResponse = new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }

    modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');
    modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    modifiedResponse.headers.set('Access-Control-Allow-Headers', '*');

    return modifiedResponse;
  } catch (error) {
    return new Response('无法访问目标地址: ' + error.message, {
      status: 500
    });
  }
}
