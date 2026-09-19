import type {
  PublicIntroDoc,
  PublicIntroInline,
  PublicIntroMark,
} from "@/lib/api/types";

/**
 * مقدّمة الاستمارة: تُصيَّر عناصرَ React من مستند مهيكل، لا HTML يُحقن.
 *
 * ما يُخزَّن مستندٌ محدود العُقد يتحقّق منه الخادم عقدةً بعقدة، وما يصل هنا
 * يُقابَل بنوعٍ صريح لكل عقدة — فنصٌّ يكتبه موظف لا يصير وسمًا في متصفّح
 * زائر مهما كُتب فيه. ولذلك لا `dangerouslySetInnerHTML` في هذا الملف ولا
 * حاجة إلى مُعقِّم.
 */
function Marked({ node }: { node: PublicIntroInline }) {
  if (node.type === "hardBreak") return <br />;

  const marks = node.marks ?? [];
  const link = marks.find(
    (mark): mark is Extract<PublicIntroMark, { type: "link" }> =>
      mark.type === "link",
  );

  let content: React.ReactNode = node.text;

  if (marks.some((mark) => mark.type === "bold")) {
    content = <strong>{content}</strong>;
  }

  if (marks.some((mark) => mark.type === "italic")) {
    content = <em>{content}</em>;
  }

  if (link) {
    return (
      <a
        href={link.attrs.href}
        target="_blank"
        // الرابط كتبه موظف لا الموقع: `noopener` تقطع وصول الصفحة المفتوحة
        // إلى هذه، و`nofollow` تمنع أن يصير حقل مقدّمة بابًا لتمرير الترتيب.
        rel="noopener noreferrer nofollow"
        className="text-primary underline underline-offset-4"
      >
        {content}
      </a>
    );
  }

  return <>{content}</>;
}

function Inline({ nodes }: { nodes: PublicIntroInline[] | undefined }) {
  if (!nodes || nodes.length === 0) return null;

  return (
    <>
      {nodes.map((node, index) => (
        <Marked key={index} node={node} />
      ))}
    </>
  );
}

export function IntroContent({ doc }: { doc: PublicIntroDoc }) {
  return (
    <div className="space-y-4 text-base leading-loose text-muted-foreground">
      {doc.content.map((node, index) => {
        if (node.type === "paragraph") {
          return (
            <p key={index}>
              <Inline nodes={node.content} />
            </p>
          );
        }

        /**
         * العنوان الفرعي `h2` لا `h3`: عنوان الاستمارة هو `h1` في الصفحة،
         * وقفزة مستوى تكسر ترتيب العناوين على قارئ الشاشة.
         */
        if (node.type === "heading") {
          return (
            <h2 key={index} className="text-lg font-bold text-foreground">
              <Inline nodes={node.content} />
            </h2>
          );
        }

        const List = node.type === "bulletList" ? "ul" : "ol";

        return (
          <List
            key={index}
            className={`space-y-1 ps-6 ${
              node.type === "bulletList" ? "list-disc" : "list-decimal"
            }`}
          >
            {node.content.map((item, itemIndex) => (
              <li key={itemIndex}>
                {item.content.map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex}>
                    <Inline nodes={paragraph.content} />
                  </p>
                ))}
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
