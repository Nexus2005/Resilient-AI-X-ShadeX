import { PageHeader } from "@/components/domain/page-header";

export function ApiUnavailable({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} />
      <div className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-[16px] font-semibold">The application service did not respond</h2>
        <p className="mt-1 max-w-[60ch] text-[14px] leading-6 text-muted">
          Check that the API is running, then reload this page. No figures are
          shown because nothing could be read.
        </p>
      </div>
    </div>
  );
}
