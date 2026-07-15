import { buildIsolatedContractDocument } from "@/lib/contract-html";

type ContractHtmlFrameProps = {
  content: string;
  title: string;
  className?: string;
};

export function ContractHtmlFrame({
  content,
  title,
  className = "h-[60vh] min-h-[28rem]",
}: ContractHtmlFrameProps) {
  return (
    <iframe
      title={title}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={buildIsolatedContractDocument(content)}
      className={`block w-full border-0 bg-white ${className}`}
    />
  );
}
