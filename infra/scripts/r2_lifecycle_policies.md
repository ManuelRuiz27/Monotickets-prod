# Cloudflare R2 Lifecycle Policies

The following JSON snippets illustrate lifecycle transitions aligned with the
backup strategy described in `docs/backups-and-lifecycle.md`. Adjust the bucket
name and filters per environment.

```json
{
  "Rules": [
    {
      "Enabled": true,
      "ID": "standard-to-infrequent",
      "Filter": { "Prefix": "" },
      "Transitions": [
        { "Days": 30, "StorageClass": "InfrequentAccess" }
      ],
      "DeleteMarkerReplication": { "Status": "Disabled" }
    },
    {
      "Enabled": true,
      "ID": "infrequent-to-archive",
      "Filter": { "Prefix": "" },
      "Transitions": [
        { "Days": 180, "StorageClass": "Archive" }
      ]
    },
    {
      "Enabled": true,
      "ID": "archive-expiration",
      "Expiration": { "Days": 540 }
    }
  ]
}
```

## UI steps

1. In Cloudflare Dashboard, open **R2** → **Buckets** and select the target bucket.
2. Navigate to **Lifecycle rules** → **Create rule**.
3. Use the wizard to add transitions at 30 and 180 days, and set expiration at
   540 days (18 months). Repeat per environment (dev/staging/prod) adjusting the
   thresholds if needed.

## API / CLI steps

1. Authenticate with `cloudflared r2` or use the AWS S3-compatible API.
2. Save the JSON into `lifecycle.json` and run:
   ```bash
   aws --endpoint-url "$R2_ENDPOINT" s3api put-bucket-lifecycle-configuration \
     --bucket "$R2_BUCKET" \
     --lifecycle-configuration file://lifecycle.json
   ```
3. Verify the policy:
   ```bash
   aws --endpoint-url "$R2_ENDPOINT" s3api get-bucket-lifecycle-configuration \
     --bucket "$R2_BUCKET"
   ```
4. Document applied policies in the environment runbook.
