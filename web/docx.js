// Word (.docx) → Markdown import. Needs mammoth, turndown and turndown-plugin-gfm
// to be loaded first. Shared by the Electron app and the web build.
(function () {
  'use strict';

  let service = null;

  function turndown() {
    if (service) return service;
    service = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
    });
    if (window.turndownPluginGfm) service.use(window.turndownPluginGfm.gfm);
    // Word tables have no header row, which the GFM plugin requires, so the
    // first row becomes the header.
    service.addRule('table', {
      filter: 'table',
      replacement: (content, node) => {
        const rows = [...node.rows].map((tr) => [...tr.cells].map((cell) =>
          service.turndown(cell.innerHTML).replace(/\s*\n+\s*/g, ' ').replace(/\|/g, '\\|').trim()));
        if (!rows.length) return '';
        const width = Math.max(...rows.map((r) => r.length));
        const line = (r) => '| ' + r.concat(Array(width - r.length).fill('')).join(' | ') + ' |';
        const divider = line(Array(width).fill('---'));
        return '\n\n' + [line(rows[0]), divider, ...rows.slice(1).map(line)].join('\n') + '\n\n';
      },
    });
    // Embedded images would become huge base64 blobs; leave a marker instead.
    service.addRule('image', { filter: 'img', replacement: () => '*[image]*' });
    return service;
  }

  async function toMarkdown(arrayBuffer) {
    const { value } = await mammoth.convertToHtml({ arrayBuffer });
    return turndown().turndown(value).trim() + '\n';
  }

  window.DocxImport = {
    toMarkdown,
    isDocx: (name) => /\.docx$/i.test(name),
    // "report.docx" → "report.md"
    mdName: (name) => name.replace(/\.docx$/i, '.md'),
  };
})();
