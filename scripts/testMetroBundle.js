async function test() {
  console.log('Fetching index from http://localhost:8081...');
  const indexRes = await fetch('http://localhost:8081');
  console.log('GET / status:', indexRes.status);
  const html = await indexRes.text();
  console.log('HTML contains root div:', html.includes('id="root"'));
  
  const match = html.match(/src="([^"]+entry\.bundle[^"]*)"/);
  let bundleUrl;
  if (match) {
    bundleUrl = 'http://localhost:8081' + match[1];
  } else {
    bundleUrl = 'http://localhost:8081/node_modules/expo-router/entry.bundle?platform=web&dev=true&hot=false&transform.engine=hermes&transform.routerRoot=app';
  }
  
  console.log('Fetching bundle URL:', bundleUrl);
  const bundleRes = await fetch(bundleUrl);
  console.log('GET bundle status:', bundleRes.status);
  console.log('Content-Type:', bundleRes.headers.get('content-type'));
  
  const bundleText = await bundleRes.text();
  console.log('Bundle length:', bundleText.length);
  
  if (bundleRes.status === 200 && bundleRes.headers.get('content-type')?.includes('application/javascript')) {
    console.log('SUCCESS: Bundle served as executable JavaScript with 200 OK!');
  } else if (bundleRes.status === 500) {
    console.error('FAILED: Metro returned 500 error:', bundleText.slice(0, 500));
    process.exit(1);
  } else {
    console.log('Response preview:', bundleText.slice(0, 200));
  }
}

test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
