export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-5xl font-extrabold">404</h1>
      <p className="mt-4 text-zinc-500">This page could not be found.</p>
      <a href="/" className="mt-6 inline-block text-indigo-600 hover:underline">
        Back to home
      </a>
    </div>
  );
}
