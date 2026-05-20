/**
 * Keenan's email signature HTML block. Append to any email sent
 * from keenan@getacuity.io. Not used on hello@getacuity.io emails.
 *
 * Requires the headshot at public/email/keenan-headshot.png to be
 * deployed so it's accessible at https://getacuity.io/email/keenan-headshot.png.
 */

export function keenanSignatureHtml(): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333333; font-size: 14px; line-height: 1.4;">
  <tr>
    <td style="padding-right: 16px; vertical-align: top;">
      <img src="https://getacuity.io/email/keenan-headshot.png" alt="Keenan" width="72" height="72" style="border-radius: 50%; display: block;" />
    </td>
    <td style="vertical-align: top;">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr><td style="font-size: 16px; font-weight: 600; color: #181614; padding-bottom: 2px;">Keenan Assaraf</td></tr>
        <tr><td style="font-size: 13px; color: #666666; padding-bottom: 8px;">Co-Founder &middot; <a href="https://getacuity.io" style="color: #7C5CFC; text-decoration: none;">Acuity</a></td></tr>
        <tr><td style="border-top: 1px solid #E8DDD0; padding-top: 8px;">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr><td style="font-size: 12px; color: #888888;"><a href="mailto:keenan@getacuity.io" style="color: #333333; text-decoration: none;">keenan@getacuity.io</a> &middot; Dallas, TX</td></tr>
            <tr><td style="font-size: 12px; padding-top: 4px;"><a href="https://getacuity.io" style="color: #7C5CFC; text-decoration: none;">getacuity.io</a>&nbsp;&nbsp;<a href="https://apps.apple.com/us/app/acuity-daily/id6762633410" style="color: #7C5CFC; text-decoration: none;">App Store</a></td></tr>
          </table>
        </td></tr>
      </table>
    </td>
  </tr>
</table>`;
}
