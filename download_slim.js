const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

https.get('https://api.github.com/repos/kamranahmedse/slim/releases/latest', { headers: { 'User-Agent': 'NodeJS' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        const release = JSON.parse(data);
        const winAsset = release.assets.find(a => a.name.includes('windows_amd64.zip'));
        if (!winAsset) {
            console.log('No Windows asset found');
            process.exit(1);
        }

        console.log('Downloading...', winAsset.browser_download_url);

        https.get(winAsset.browser_download_url, (resRedirect) => {
            const redirectUrl = resRedirect.headers.location;
            if (redirectUrl) {
                https.get(redirectUrl, (fileRes) => {
                    const file = fs.createWriteStream('slim.zip');
                    fileRes.pipe(file);
                    file.on('finish', () => {
                        console.log('Download complete. Extracting...');
                        file.close();
                        execSync('powershell.exe -Command "Expand-Archive slim.zip -DestinationPath slim_bin -Force"');
                        console.log('Extracted successfully!');
                    });
                });
            } else {
                console.log('No redirect url found for asset dl');
            }
        });
    });
});
