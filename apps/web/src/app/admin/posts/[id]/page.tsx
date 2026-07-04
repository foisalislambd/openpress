import { ContentEditor } from '@/components/content-editor';

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ContentEditor type="POST" contentId={id} />;
}
