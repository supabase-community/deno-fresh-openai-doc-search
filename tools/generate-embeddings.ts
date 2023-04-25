import "https://deno.land/std@0.182.0/dotenv/load.ts";
import "https://deno.land/x/xhr@0.2.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.5.0";
import { createHash } from "https://deno.land/std@0.110.0/node/crypto.ts";
import { ObjectExpression } from "https://esm.sh/v115/@types/estree@1.0.0/index.d.ts";
import GithubSlugger from "https://esm.sh/github-slugger@2.0.0";
import {
  Content,
  Root,
} from "https://esm.sh/v115/@types/mdast@3.0.11/index.d.ts";
import { fromMarkdown } from "https://esm.sh/mdast-util-from-markdown@1.3.0";
import { mdxFromMarkdown, MdxjsEsm } from "https://esm.sh/mdast-util-mdx@2.0.1";
import { toMarkdown } from "https://esm.sh/mdast-util-to-markdown@1.5.0";
import { toString } from "https://esm.sh/mdast-util-to-string@3.2.0";
import { mdxjs } from "https://esm.sh/micromark-extension-mdxjs@1.0.0";
import "openai";
import { Configuration, OpenAIApi } from "https://esm.sh/openai@3.1.0";
import {
  basename,
  dirname,
  join,
} from "https://deno.land/std@0.183.0/path/mod.ts";
import { u } from "https://esm.sh/unist-builder@3.0.1";
import { filter } from "https://esm.sh/unist-util-filter@4.0.1";

const ignoredFiles = ["routes/404.mdx"];

/**
 * Extracts ES literals from an `estree` `ObjectExpression`
 * into a plain JavaScript object.
 */
function getObjectFromExpression(node: ObjectExpression) {
  return node.properties.reduce<
    Record<string, string | number | bigint | true | RegExp | undefined>
  >((object, property) => {
    if (property.type !== "Property") {
      return object;
    }

    const key = (property.key.type === "Identifier" && property.key.name) ||
      undefined;
    const value = (property.value.type === "Literal" && property.value.value) ||
      undefined;

    if (!key) {
      return object;
    }

    return {
      ...object,
      [key]: value,
    };
  }, {});
}

/**
 * Extracts the `meta` ESM export from the MDX file.
 *
 * This info is akin to frontmatter.
 */
function extractMetaExport(mdxTree: Root) {
  const metaExportNode = mdxTree.children.find((node): node is MdxjsEsm => {
    return (
      node.type === "mdxjsEsm" &&
      node.data?.estree?.body[0]?.type === "ExportNamedDeclaration" &&
      node.data.estree.body[0].declaration?.type === "VariableDeclaration" &&
      node.data.estree.body[0].declaration.declarations[0]?.id.type ===
        "Identifier" &&
      node.data.estree.body[0].declaration.declarations[0].id.name === "meta"
    );
  });

  if (!metaExportNode) {
    return undefined;
  }

  const objectExpression =
    (metaExportNode.data?.estree?.body[0]?.type === "ExportNamedDeclaration" &&
      metaExportNode.data.estree.body[0].declaration?.type ===
        "VariableDeclaration" &&
      metaExportNode.data.estree.body[0].declaration.declarations[0]?.id
          .type === "Identifier" &&
      metaExportNode.data.estree.body[0].declaration.declarations[0].id.name ===
        "meta" &&
      metaExportNode.data.estree.body[0].declaration.declarations[0].init
          ?.type ===
        "ObjectExpression" &&
      metaExportNode.data.estree.body[0].declaration.declarations[0].init) ||
    undefined;

  if (!objectExpression) {
    return undefined;
  }

  return getObjectFromExpression(objectExpression);
}

/**
 * Splits a `mdast` tree into multiple trees based on
 * a predicate function. Will include the splitting node
 * at the beginning of each tree.
 *
 * Useful to split a markdown file into smaller sections.
 */
function splitTreeBy(tree: Root, predicate: (node: Content) => boolean) {
  return tree.children.reduce<Root[]>((trees, node) => {
    const [lastTree] = trees.slice(-1);

    if (!lastTree || predicate(node)) {
      const tree: Root = u("root", [node]);
      return trees.concat(tree);
    }

    lastTree.children.push(node);
    return trees;
  }, []);
}

type Meta = ReturnType<typeof extractMetaExport>;

type Section = {
  content: string;
  heading?: string;
  slug?: string;
};

type ProcessedMdx = {
  checksum: string;
  meta: Meta;
  sections: Section[];
};

/**
 * Processes MDX content for search indexing.
 * It extracts metadata, strips it of all JSX,
 * and splits it into sub-sections based on criteria.
 */
function processMdxForSearch(content: string): ProcessedMdx {
  const checksum = createHash("sha256").update(content).digest(
    "base64",
  ) as string;

  const mdxTree = fromMarkdown(content, {
    extensions: [mdxjs()],
    mdastExtensions: [mdxFromMarkdown()],
  });

  const meta = extractMetaExport(mdxTree);

  // Remove all MDX elements from markdown
  const mdTree = filter(
    mdxTree,
    (node) =>
      ![
        "mdxjsEsm",
        "mdxJsxFlowElement",
        "mdxJsxTextElement",
        "mdxFlowExpression",
        "mdxTextExpression",
      ].includes(node.type),
  );

  if (!mdTree) {
    return {
      checksum,
      meta,
      sections: [],
    };
  }

  const sectionTrees = splitTreeBy(mdTree, (node) => node.type === "heading");

  const slugger = new GithubSlugger();

  const sections = sectionTrees.map((tree) => {
    const [firstNode] = tree.children;

    const heading = firstNode.type === "heading"
      ? toString(firstNode)
      : undefined;
    const slug = heading ? slugger.slug(heading) : undefined;

    return {
      content: toMarkdown(tree),
      heading,
      slug,
    };
  });

  return {
    checksum,
    meta,
    sections,
  };
}

type WalkEntry = {
  path: string;
  parentPath?: string;
};

async function walk(dir: string, parentPath?: string): Promise<WalkEntry[]> {
  const immediateFiles: Array<string> = [];
  for await (const dirEntry of Deno.readDir(dir)) {
    immediateFiles.push(dirEntry.name);
  }

  const recursiveFiles = await Promise.all(
    immediateFiles.map(async (file) => {
      const path = join(dir, file);
      const stats = await Deno.stat(path);
      if (stats.isDirectory) {
        // Keep track of document hierarchy (if this dir has corresponding doc file)
        const docPath = `${basename(path)}.mdx`;

        return walk(
          path,
          immediateFiles.includes(docPath)
            ? join(dirname(path), docPath)
            : parentPath,
        );
      } else if (stats.isFile) {
        return [
          {
            path: path,
            parentPath,
          },
        ];
      } else {
        return [];
      }
    }),
  );

  const flattenedFiles = recursiveFiles.reduce(
    (all, folderContents) => all.concat(folderContents),
    [],
  );

  return flattenedFiles.sort((a, b) => a.path.localeCompare(b.path));
}

abstract class BaseEmbeddingSource {
  checksum?: string;
  meta?: Meta;
  sections?: Section[];

  constructor(
    public source: string,
    public path: string,
    public parentPath?: string,
  ) {}

  abstract load(): Promise<{
    checksum: string;
    meta?: Meta;
    sections: Section[];
  }>;
}

class MarkdownEmbeddingSource extends BaseEmbeddingSource {
  type: "markdown" = "markdown";

  constructor(
    source: string,
    public filePath: string,
    public parentFilePath?: string,
  ) {
    const path = filePath.replace(/^docs/, "").replace(/\.mdx?$/, "");
    const parentPath = parentFilePath?.replace(/^docs/, "").replace(
      /\.mdx?$/,
      "",
    );

    super(source, path, parentPath);
  }

  async load() {
    const decoder = new TextDecoder("utf-8");
    const data = await Deno.readFile(this.filePath);
    const contents = decoder.decode(data);

    const { checksum, meta, sections } = processMdxForSearch(contents);

    this.checksum = checksum;
    this.meta = meta;
    this.sections = sections;

    return {
      checksum,
      meta,
      sections,
    };
  }
}

type EmbeddingSource = MarkdownEmbeddingSource;

async function generateEmbeddings() {
  if (
    !Deno.env.get("SUPABASE_URL") ||
    !Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    !Deno.env.get("OPENAI_KEY")
  ) {
    return console.log(
      "Environment variables NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPENAI_KEY are required: skipping embeddings generation",
    );
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  const embeddingSources: EmbeddingSource[] = [
    ...(await walk("docs"))
      .filter(({ path }) => /\.mdx?$/.test(path))
      .filter(({ path }) => !ignoredFiles.includes(path))
      .map((entry) => new MarkdownEmbeddingSource("guide", entry.path)),
  ];

  console.log(`Discovered ${embeddingSources.length} docs`);

  for (const embeddingSource of embeddingSources) {
    const { type, source, path, parentPath } = embeddingSource;

    try {
      const { checksum, meta, sections } = await embeddingSource.load();

      // Check for existing page in DB and compare checksums
      const { data: existingPage } = await supabaseClient
        .from("dfods_page")
        .select("id, path, checksum, parentPage:parent_page_id(id, path)")
        .filter("path", "eq", path)
        .limit(1)
        .maybeSingle()
        .throwOnError();

      // deno-lint-ignore no-explicit-any
      type Singular<T> = T extends any[] ? undefined : T;

      // We use checksum to determine if this page & its sections need to be regenerated
      if (existingPage?.checksum === checksum) {
        const existingParentPage = existingPage?.parentPage as Singular<
          typeof existingPage.parentPage
        >;

        // If parent page changed, update it
        if (existingParentPage?.path !== parentPath) {
          console.log(
            `[${path}] Parent page has changed. Updating to '${parentPath}'...`,
          );
          const { data: parentPage } = await supabaseClient
            .from("dfods_page")
            .select()
            .filter("path", "eq", parentPath)
            .limit(1)
            .maybeSingle()
            .throwOnError();

          await supabaseClient
            .from("dfods_page")
            .update({ parent_page_id: parentPage?.id })
            .filter("id", "eq", existingPage.id)
            .throwOnError();
        }
        continue;
      }

      if (existingPage) {
        console.log(
          `[${path}] Docs have changed, removing old page sections and their embeddings`,
        );

        await supabaseClient
          .from("dfods_page_section")
          .delete()
          .filter("page_id", "eq", existingPage.id)
          .throwOnError();
      }

      const { data: parentPage } = await supabaseClient
        .from("dfods_page")
        .select()
        .filter("path", "eq", parentPath)
        .limit(1)
        .maybeSingle()
        .throwOnError();

      // Create/update page record. Intentionally clear checksum until we
      // have successfully generated all page sections.
      const { data: page } = await supabaseClient
        .from("dfods_page")
        .upsert(
          {
            checksum: null,
            path,
            type,
            source,
            meta,
            parent_page_id: parentPage?.id,
          },
          { onConflict: "path" },
        )
        .select()
        .limit(1)
        .single()
        .throwOnError();

      console.log(
        `[${path}] Adding ${sections.length} page sections (with embeddings)`,
      );
      for (const { slug, heading, content } of sections) {
        // OpenAI recommends replacing newlines with spaces for best results (specific to embeddings)
        const input = content.replace(/\n/g, " ");

        try {
          const configuration = new Configuration({
            apiKey: Deno.env.get("OPENAI_KEY"),
          });
          const openai = new OpenAIApi(configuration);

          const embeddingResponse = await openai.createEmbedding({
            model: "text-embedding-ada-002",
            input,
          });

          if (embeddingResponse.status !== 200) {
            throw new Error(
              Deno.inspect(embeddingResponse.data, {
                showHidden: false,
                depth: 2,
              }),
            );
          }

          const [responseData] = embeddingResponse.data.data;

          await supabaseClient
            .from("dfods_page_section")
            .insert({
              page_id: page.id,
              slug,
              heading,
              content,
              token_count: embeddingResponse.data.usage.total_tokens,
              embedding: responseData.embedding,
            })
            .select()
            .limit(1)
            .single()
            .throwOnError();
        } catch (err) {
          // TODO: decide how to better handle failed embeddings
          console.error(
            `Failed to generate embeddings for '${path}' page section starting with '${
              input.slice(
                0,
                40,
              )
            }...'`,
          );

          throw err;
        }
      }

      // Set page checksum so that we know this page was stored successfully
      await supabaseClient
        .from("dfods_page")
        .update({ checksum })
        .filter("id", "eq", page.id)
        .throwOnError();
    } catch (err) {
      console.error(
        `Page '${path}' or one/multiple of its page sections failed to store properly. Page has been marked with null checksum to indicate that it needs to be re-generated.`,
      );
      console.error(err);
    }
  }

  console.log("Embedding generation complete");
}

async function main() {
  await generateEmbeddings();
}

main().catch((err) => console.error(err));
