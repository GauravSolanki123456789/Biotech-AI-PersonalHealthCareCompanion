"use client";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

type Props = {
  code: string;
};

export function InstrumentCodeBlock({ code }: Props) {
  return (
    <SyntaxHighlighter
      language="python"
      style={oneLight}
      showLineNumbers={false}
      PreTag="div"
      customStyle={{
        margin: 0,
        borderRadius: "0.75rem",
        fontSize: "0.8125rem",
        border: "1px solid rgb(226 232 240)",
      }}
    >
      {code}
    </SyntaxHighlighter>
  );
}
