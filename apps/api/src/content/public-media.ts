/** Media that is already exposed by a published, public post or page. */
export const PUBLISHED_MEDIA_MATCH = `
  m.url <> ''
  AND EXISTS (
    SELECT 1 FROM contents c
    WHERE c."siteId" = m."siteId"
      AND c.status = 'PUBLISHED'
      AND c.visibility = 'PUBLIC'
      AND (c."coverImage" = m.url OR strpos(c.blocks::text, m.url) > 0)
  )
`;
