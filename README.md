# Alive5 SMS

Send one SMS from an Alive5 business number with a dependency-free JavaScript GitHub Action running on Node.js 24.

## Setup

In your [Alive5 dashboard](https://app.alive5.com/), open **Integrations → API Key**. Copy your existing key, or select **Generate** if you do not have one. Save it as the GitHub Actions repository secret `ALIVE5_API_KEY`.

Use `GET https://api.alive5.com/public/1.0/objects/channels-and-users/list` with the `X-A5-APIKEY` header to find your sender details. In `data.Items`, select the SMS channel whose `channel_label` is your business phone number. Use its `channel_id` and an assigned agent's `agents[].user_id`. Store these as repository variables `ALIVE5_FROM`, `ALIVE5_CHANNEL_ID`, and `ALIVE5_USER_ID`.

## Usage

Place this workflow in your repository's `.github/workflows/` directory. The action needs no `GITHUB_TOKEN` permissions.

```yaml
name: Send SMS
on: workflow_dispatch
permissions: {}
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Send SMS
        id: sms
        uses: imraghavojha/alive5-sms-action@v1
        with:
          api-key: ${{ secrets.ALIVE5_API_KEY }}
          from: ${{ vars.ALIVE5_FROM }}
          channel-id: ${{ vars.ALIVE5_CHANNEL_ID }}
          user-id: ${{ vars.ALIVE5_USER_ID }}
          to: '+14155550123' # Replace with your recipient.
          message: 'Your workflow has completed.'
      - name: Show submission IDs
        env:
          MESSAGE_ID: ${{ steps.sms.outputs.message-id }}
          CONVERSATION_ID: ${{ steps.sms.outputs.conversation-id }}
        run: printf 'Message ID: %s\nConversation ID: %s\n' "$MESSAGE_ID" "$CONVERSATION_ID"
```

Self-hosted runners need runner v2.327.1 or later (Node 24).

## Versioning

Releases use semantic versioning. The `v1` tag moves to the latest compatible release. Pin a full commit SHA for strict reproducibility.

## Inputs

| Input | Required | Description |
| --- | --- | --- |
| `api-key` | Yes | Alive5 API key, supplied through a GitHub secret. |
| `to` | Yes | Recipient in E.164 format, matching `^\+[1-9]\d{7,14}$`. |
| `message` | Yes | Nonblank SMS text; whitespace is preserved. |
| `from` | Yes | Alive5 business SMS number in the same E.164 format. |
| `channel-id` | Yes | Channel associated with `from`. |
| `user-id` | Yes | Agent assigned to that channel. |

All inputs are account-specific or message-specific and have no defaults. Requests time out after 20 seconds.

## Outputs

| Output | Description |
| --- | --- |
| `message-id` | Submitted message ID from `data.data.message_id`. |
| `conversation-id` | Conversation ID from `data.data.thread_id`; empty if absent. |

A successful result confirms submission, not delivery. HTTP failures and body-level Alive5 errors fail the step with the HTTP status and available string error details, truncated to 200 characters per field. The API key and SMS text are redacted from these details. The action does not retry automatically; check conversation history before retrying an ambiguous response to avoid duplicate messages.

## License

[MIT](LICENSE), copyright 2026 Raghav Ojha.
