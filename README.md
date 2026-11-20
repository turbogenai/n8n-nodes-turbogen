# n8n-nodes-turbogen

[n8n](https://n8n.io) community node for [Turbogen](https://turbogen.app/?src=n8n): pay-as-you-go AI video, image and audio generation through one API. Models include Seedance 2.5, Kling, Veo 3.1 Fast, Nano Banana Pro and more. No subscription: you buy credits and spend them per generation.

[Turbogen](https://turbogen.app/?src=n8n) | [API reference](https://turbogen.app/api-docs) | [n8n community nodes docs](https://docs.n8n.io/integrations/community-nodes/)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/):

1. In n8n open **Settings > Community Nodes**.
2. Select **Install** and enter `n8n-nodes-turbogen`.
3. Accept the community node risk notice and install.

Self-hosted n8n can also install it from the command line in the n8n data folder: `npm install n8n-nodes-turbogen`.

## Credentials

1. Create an account at [turbogen.app](https://turbogen.app/?src=n8n) and add credits.
2. Open the API page ([turbogen.app/#/apikeys](https://turbogen.app/#/apikeys)) and create an API key (it starts with `lk_`).
3. In n8n create a **Turbogen API** credential and paste the key. The credential test calls your account to confirm the key works.

## Operations

| Resource | Operation | What it does |
| --- | --- | --- |
| Video | Generate | Text-to-video or image-to-video. Pick model, aspect ratio and duration; optionally wait for the finished file. |
| Image | Generate | Text-to-image with optional reference images from binary fields. |
| Audio | Generate | Voiceover, music, songs with lyrics, sound effects. |
| Job | Get | Status of a job, optionally waiting until it is done, optionally attaching the file. |
| Job | Download | Result file of a finished job as binary data. |
| Job | Get Many | Your latest jobs (up to 200). |
| Job | Delete | Remove a finished job and its file. |
| Account | Get Balance | Remaining credits. |
| Model | Get Many | The live model catalog with ids, options and credit prices (public, no key needed). |

Model, aspect ratio and duration/quality dropdowns are loaded live from the Turbogen catalog, so new models appear without updating the node. The price of a job is shown next to each option in credits.

### Waiting for results

Video generation takes 1 to 5 minutes. With **Wait for Completion** on (default), the node polls until the job is done and returns the file as binary data in the field `data`. With it off, the node returns the job id immediately and you can fetch the file later with **Job > Get** or **Job > Download**. Failed jobs are refunded automatically.

### Image-to-video and reference images

Put the picture into a binary field (for example with an HTTP Request or Google Drive node) and enter that field name in **Input Image Binary Fields**. Several fields can be listed, comma-separated. The limit per model is shown in the catalog (`max_refs`).

## Example workflows

Import these from the `examples` folder (**Workflows > Import from file**), then select your own credentials:

- [`01-prompt-to-seedance-video-to-google-drive.json`](examples/01-prompt-to-seedance-video-to-google-drive.json): text prompt, Seedance 2.5 video, upload to Google Drive.
- [`02-product-photo-to-video.json`](examples/02-product-photo-to-video.json): download a product photo, turn it into a vertical video, save to Google Drive.
- [`03-batch-images-from-sheet.json`](examples/03-batch-images-from-sheet.json): read prompts from a Google Sheet (column `prompt`), generate an image per row, save each to Google Drive.

## Compatibility

Works with n8n 1.x and 2.x. The node has no runtime dependencies.

## Resources

- [Turbogen](https://turbogen.app/?src=n8n)
- [Turbogen API documentation](https://turbogen.app/api-docs)
- [Turbogen MCP server](https://github.com/turbogenai/turbogen-mcp) for AI assistants

## License

[MIT](LICENSE.md)
