import { ContentEditor } from '@/components/content-editor';

export default async function EditPagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ContentEditor type="PAGE" contentId={id} />;
}
