import * as cheerio from 'cheerio';

export function fix(html: string, webhookUrl?: string): string {
  const $ = cheerio.load(html);

  $('form').each(function () {
    const form = $(this);
    const action = form.attr('action');

    // Skip if action is empty, "#", or not set
    if (action !== undefined && action !== '' && action !== '#') {
      form.attr('data-original-action', action);
      form.attr('action', webhookUrl ?? '#');
    }

    // Remove platform form attributes
    form.removeAttr('data-wf-page-id');
    form.removeAttr('wf-form');
    form.removeAttr('data-hook');
    form.removeAttr('data-node-type');
  });

  return $.html();
}
