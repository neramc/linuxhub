import { describe, expect, it } from "vitest";
import { parseMirrorManager } from "./mirrormanager";

const row = (cc: string, host: string, products: string) => `
  <tr class="mirror-row">
    <td>${cc}</td>
    <td><a href="https://${host}">Site</a></td>
    <td>${host}</td>
    <td><ul class="list-unstyled">${products}</ul></td>
    <td>10000</td>
    <td>No</td>
    <td></td>
  </tr>`;

const product = (name: string, ...links: [string, string][]) =>
  `<li>
    ${name}
    ${links.map(([url, proto]) => `<a href="${url}">${proto}</a>`).join("\n")}
  </li>`;

const page = `<p>We currently have 4 active mirrors for Fedora 44 on x86_64</p>
<table>
  <tr><th>Country</th></tr>
  ${row("KR", "a.example.kr", product("Fedora Linux", ["https://a.example.kr/fedora/linux", "https"], ["http://a.example.kr/fedora/linux", "http"]) + product("Fedora EPEL", ["https://a.example.kr/epel", "https"]))}
  ${row("DE", "b.example.de", product("Fedora Linux", ["http://b.example.de/fedora/linux", "http"], ["rsync://b.example.de/fedora", "rsync"]))}
  ${row("United States", "c.example.com", product("CentOS", ["https://c.example.com/centos-stream/.", "https"]))}
  ${row("FR", "d.example.fr", product("CentOS", ["https://d.example.fr/centos-stream", "https"]) + product("Fedora Linux", ["https://d.example.fr/fedora/linux", "https"]))}
</table>`;

describe("MirrorManager list pages", () => {
  it("reads the HTTPS root of one product per mirror", () => {
    const fedora = parseMirrorManager(page, "Fedora Linux");
    expect(fedora.total).toBe(4);
    expect(fedora.rows).toBe(4);
    expect(fedora.mirrors).toEqual([
      { root: "https://a.example.kr/fedora/linux/", country: "KR" },
      { root: "https://d.example.fr/fedora/linux/", country: "FR" },
    ]);
  });

  it("tidies roots and maps country names", () => {
    expect(parseMirrorManager(page, "CentOS").mirrors).toEqual([
      { root: "https://c.example.com/centos-stream/", country: "US" },
      { root: "https://d.example.fr/centos-stream/", country: "FR" },
    ]);
  });

  it("reports an unreadable page instead of an empty list", () => {
    const parsed = parseMirrorManager("<html>maintenance</html>", "CentOS");
    expect(parsed.total).toBeNull();
    expect(parsed.rows).toBe(0);
    expect(parsed.mirrors).toEqual([]);
  });
});
