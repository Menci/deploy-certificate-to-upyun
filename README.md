# GitHub Action for Deploying SSL certificate to Upyun

Deploy SSL certificate to Upyun CDN or OSS.

# Usage

> If you need to issue SSL certificates automatically, you can use [my acme.sh action](https://github.com/marketplace/actions/issue-ssl-certificate).

This action will deploy your PEM-formatted SSL certificate to Upyun. Since it uses Upyun's console API, you must use a subaccount (NOT your main account since it requires 2FA) as credential.

```yaml
jobs:
  deploy-to-upyun:
    name: Deploy certificate to Upyun
    runs-on: ubuntu-latest
    steps:
      - name: Check out
        uses: actions/checkout@v2
        with:
          # If you just commited and pushed your newly issued certificate to this repo in a previous job,
          # use `ref` to make sure checking out the newest commit in this job
          ref: ${{ github.ref }}
      - uses: Menci/deploy-certificate-to-aliyun@beta-v2
        with:
          # Subaccount
          subaccount-username: ${{ secrets.UPYUN_SUBACCOUNT_USERNAME }}
          subaccount-password: ${{ secrets.UPYUN_SUBACCOUNT_PASSWORD }}

          # Specify PEM fullchain file
          fullchain-file: ${{ env.FILE_FULLCHAIN }}
          # Specify PEM private key file
          key-file: ${{ env.FILE_KEY }}

          # Deploy to CDN or OSS
          cdn-domains: |
            cdn1.example.com
            cdn2.example.com
            oss1.example.com
            oss2.example.com
          
          # Delete ALL unused certificates after deployment
          delete-unused-certificates: true
```
