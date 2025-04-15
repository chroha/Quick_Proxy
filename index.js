addEventListener('fetch', event => {
	event.respondWith(handleRequest(event.request));
});

// 从环境变量中读取密码
const PASSWORD = PASSWORD || "mysecret";

async function handleRequest(request) {
	const url = new URL(request.url);
	const userPwd = url.searchParams.get("pwd");

	// 密码验证
	if (userPwd !== PASSWORD) {
		return new Response(`
			<html>
			<head><title>密码验证 - Quick Proxy</title></head>
			<body style="font-family:sans-serif;text-align:center;padding-top:100px;">
				<h2>🔐 请输入密码以访问代理服务</h2>
				<form method="GET" action="/">
					<input type="password" name="pwd" placeholder="Password" style="padding:10px;font-size:16px;">
					<br/><br/>
					<input type="submit" value="进入" style="padding:10px 20px;font-size:16px;">
				</form>
			</body></html>
		`, {
			status: 401,
			headers: { 'Content-Type': 'text/html;charset=utf-8' }
		});
	}

	let actualUrlStr = url.pathname.replace("/", "");
	actualUrlStr = decodeURIComponent(actualUrlStr);

	// 未输入 URL，显示首页
	if (!actualUrlStr) {
		const mainDomain = url.hostname;
		const websiteTitle = "Quick Proxy";
		const errorMessage = `
		<html>
		<head>
			<title>${websiteTitle}</title>
			<link rel="icon" href="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f680.svg" type="image/svg+xml">
			<script src="https://kit.fontawesome.com/bcef49c75c.js" crossorigin="anonymous"></script>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<style>
				body {
					font-family: 'Segoe UI', sans-serif;
					background: linear-gradient(to right, #c9d6ff, #e2e2e2);
					margin: 0; padding: 0;
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
					width: 100%; max-width: 480px;
					text-align: center;
				}
				h1 { color: #333; margin-bottom: 20px; }
				input[type="text"], input[type="password"] {
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
				@keyframes shake {
					0% { transform: translateX(0); }
					25% { transform: translateX(-5px); }
					50% { transform: translateX(5px); }
					75% { transform: translateX(-5px); }
					100% { transform: translateX(5px); }
				}
				@media (prefers-color-scheme: dark) {
					body { background-color: #333; }
					#container { background-color: #eee; }
				}
			</style>
		</head>
		<body>
			<div id="container">
				<h1>${websiteTitle}</h1>
				<p>输入需要代理的网站（Enter the website to be represented）:</p>
				<input type="text" id="url" placeholder="例如：https://github.com/" />
				<input type="password" id="pwd" placeholder="请输入密码（Enter password）" />
				<input type="button" id="submit" value="进入代理（Go to Agent）" onclick="redirectToProxy()" />
				<p style="margin-top:20px;">&copy; 2024 <a href="https://github.com/chroha" target="_blank">Github</a></p>
			</div>
			<script>
				function redirectToProxy() {
					const urlInput = document.getElementById('url');
					const pwdInput = document.getElementById('pwd');
					let inputUrl = urlInput.value.trim();
					let pwd = pwdInput.value.trim();
					if (inputUrl && pwd) {
						const url = normalizeUrl(inputUrl);
						window.open('/' + encodeURIComponent(url) + '?pwd=' + encodeURIComponent(pwd), '_blank');
						urlInput.value = '';
						pwdInput.value = '';
					} else {
						urlInput.style.animation = 'shake 0.5s';
						setTimeout(() => {
							urlInput.style.animation = '';
						}, 500);
					}
				}
				function normalizeUrl(inputUrl) {
					if (!inputUrl.startsWith("http://") && !inputUrl.startsWith("https://")) {
						inputUrl = "https://" + inputUrl;
					}
					return inputUrl;
				}
				document.addEventListener('keydown', function(event) {
					if (event.key === 'Enter') {
						document.getElementById('submit').click();
					}
				});
			</script>
		</body>
		</html>
		`;

		return new Response(errorMessage, {
			status: 400,
			headers: {
				'Content-Type': 'text/html; charset=utf-8'
			}
		});
	}

	// 清除 cf- 头部
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
			const modifiedLocation = "/" + encodeURIComponent(location.toString()) + "?pwd=" + encodeURIComponent(userPwd);
			modifiedResponse = new Response(response.body, {
				status: response.status,
				statusText: response.statusText
			});
			modifiedResponse.headers.set('Location', modifiedLocation);
		} else {
			if (response.headers.get("Content-Type")?.includes("text/html")) {
				const originalText = await response.text();
				const regex = new RegExp('((href|src|action)=["\'])/(?!/)', 'g');
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
