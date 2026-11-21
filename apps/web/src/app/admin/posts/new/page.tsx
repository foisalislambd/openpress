import { ContentEditor } from '@/components/content-editor';

export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<{ postType?: string }>;
}) {
  const params = await searchParams;
  return <ContentEditor type="POST" postType={params.postType} />;
}
