import Parser from 'rss-parser';

const TIMEOUT_MS = 10_000;

export type RssItem = Parser.Item & {
  readonly region?: string;
};

const parser = new Parser<Record<string, unknown>, RssItem>({
  timeout: TIMEOUT_MS,
  customFields: {
    item: ['region'],
  },
});

export async function fetchRssFeed(feedUrl: string): Promise<RssItem[]> {
  const feed = await parser.parseURL(feedUrl);
  return feed.items;
}
