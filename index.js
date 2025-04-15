addEventListener('fetch', event => {
	event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
	const PASSWORD = PASSWORD || ''; // Cloudflare环境变量

	const url = new URL(request.url);
	const actualUrlStr = decodeURIComponent(url.pathname.slice(1));
	const userPwd = url.searchParams.get("pwd");

	// 未输入链接，显示密码输入界面
	if (!actualUrlStr) {
		const mainDomain = url.hostname;
		const html = `
		<html>
		<head>
			<title>Proxy Access</title>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<link rel="icon" href="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f511.svg" type="image/svg+xml">
			<style>
				body {
					font-family: Arial, sans-serif;
					background: #f2f2f2;
					display: flex;
					align-items: center;
					justify-content: center;
					height: 100vh;
					margin: 0;
				}
				.container {
					background: #fff;
					padding: 30px;
					border-radius: 12px;
					box-shadow: 0 4px 12px rgba(0,0,0,0.1);
					width: 100%;
					max-width: 400px;
					text-align: center;
				}
				input[type="password"], input[type="text"] {
					width: 100%;
					padding: 12px;
					margin: 10px 0;
					border: 1px solid #ccc;
					border-radius: 6px;
				}
				button {
					padding: 12px;
					width: 100%;
					background-color: #007bff;
					color: white;
					border: none;
					border-radius: 6px;
					cursor: pointer;
				}
				button:hover {
					background-color: #0056b3;
				}
			</style>
		</head>
		<body>
			<div class="container">
				<h2>请输入密码以访问代理服务</h2>
				<h3>Please enter the password to access the proxy</h3>
				<input type="text" id="url" placeholder="例如：https://github.com/" />
				<input type="password" id="pwd" placeholder="密码 / Password" />
				<button onclick="go()">进入代理 / Access Proxy</button>
			</div>
			<script>
				function go() {
					const url = document.getElementById('url').value.trim();
					const pwd = document.getElementById('pwd').value.trim();
					if (!url || !pwd) return alert('请填写完整信息 / Please fill in both fields');
					const fullUrl = 'https://${mainDomain}/' + encodeURIComponent(url) + '?pwd=' + encodeURIComponent(pwd);
					window.location.href = fullUrl;
				}
			</script>
		</body>
		</html>
		`;

		return new Response(html, {
			headers: { 'Content-Type': 'text/html; charset=utf-8' }
		});
	}

	// 密码验证
	if (userPwd !== PASSWORD) {
		return new Response("密码错误 / Incorrect password", {
			status: 403
		});
	}

	// 清理 header
	let newHeaders = new Headers();
	for (let [key, value] of request.headers.entries()) {
		if (!key.startsWith("cf-")) newHeaders.append(key, value);
	}

	const modifiedRequest = new Request(actualUrlStr, {
		headers: newHeaders,
		method: request.method,
		body: request.body,
		redirect: 'manual'
	});

	try {
		const response = await fetch(modifiedRequest);
		let body = response.body;

		let modifiedResponse;

		// 处理跳转，添加 pwd
		if ([301, 302, 303, 307, 308].includes(response.status)) {
			let location = response.headers.get("Location");
			if (location) {
				const targetUrl = new URL(location, actualUrlStr);
				const encoded = "/" + encodeURIComponent(targetUrl.toString()) + "?pwd=" + encodeURIComponent(userPwd);
				modifiedResponse = new Response(null, {
					status: response.status,
					headers: { Location: encoded }
				});
			}
		} else {
			// 处理 HTML 内容中的资源链接
			if (response.headers.get("Content-Type")?.includes("text/html")) {
				const originalText = await response.text();
				const originPrefix = `${url.protocol}//${url.host}/${encodeURIComponent(new URL(actualUrlStr).origin + "/")}`;
				const pwdParam = `?pwd=${encodeURIComponent(userPwd)}`;

				const modifiedText = originalText.replace(/((href|src|action)=["'])\/(?!\/)/g, `$1${originPrefix}${pwdParam}&`)
					.replace(/((href|src|action)=["'])([^"']+?)["']/g, (match, p1, _, p3) => {
						if (p3.startsWith("http://") || p3.startsWith("https://")) return match;
						if (p3.includes("?")) {
							return `${p1}${p3}&pwd=${encodeURIComponent(userPwd)}"`;
						} else {
							return `${p1}${p3}?pwd=${encodeURIComponent(userPwd)}"`;
						}
					});

				body = modifiedText;
			}

			modifiedResponse = new Response(body, {
				status: response.status,
				headers: response.headers
			});
		}

		modifiedResponse.headers.set("Access-Control-Allow-Origin", "*");
		modifiedResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
		modifiedResponse.headers.set("Access-Control-Allow-Headers", "*");

		return modifiedResponse;

	} catch (err) {
		return new Response("无法访问目标地址: " + err.message, {
			status: 500
		});
	}
}
