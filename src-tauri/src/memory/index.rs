pub const SESSIONS_OPEN: &str = "<!-- memory:sessions -->";

fn eol(md: &str) -> &'static str {
    if md.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    }
}

fn split(md: &str) -> Vec<&str> {
    let body = md.strip_suffix('\n').unwrap_or(md);
    if body.is_empty() {
        return Vec::new();
    }
    body.split('\n')
        .map(|l| l.strip_suffix('\r').unwrap_or(l))
        .collect()
}

fn join(lines: &[String], eol: &str, trailing: bool) -> String {
    let mut out = lines.join(eol);
    if trailing && !lines.is_empty() {
        out.push_str(eol);
    }
    out
}

fn links_to(line: &str, file: &str) -> bool {
    line.contains(&format!("]({file})")) || line.contains(&format!("](./{file})"))
}

pub fn line_for(title: &str, file: &str, description: &str) -> String {
    if description.is_empty() {
        format!("- [{title}]({file})")
    } else {
        format!("- [{title}]({file}) — {description}")
    }
}

pub fn remove_links(md: &str, file: &str) -> String {
    let lines: Vec<String> = split(md)
        .into_iter()
        .filter(|l| !links_to(l, file))
        .map(String::from)
        .collect();
    join(&lines, eol(md), md.ends_with('\n'))
}

pub fn append_line(md: &str, line: &str) -> String {
    let mut lines: Vec<String> = split(md).into_iter().map(String::from).collect();
    let at = lines
        .iter()
        .position(|l| l.trim() == SESSIONS_OPEN)
        .map(|i| {
            let mut i = i;
            while i > 0 && lines[i - 1].trim().is_empty() {
                i -= 1;
            }
            i
        })
        .unwrap_or(lines.len());
    lines.insert(at, line.to_string());
    if facts_range(&lines[..at]).is_some_and(|(_, end)| end == at) {
        lines.insert(at, String::new());
    }
    join(&lines, eol(md), true)
}

pub const FACTS_HEADING: &str = "## Факты";

fn facts_range(lines: &[String]) -> Option<(usize, usize)> {
    let head = lines.iter().position(|l| l.trim() == FACTS_HEADING)?;
    let end = lines[head + 1..]
        .iter()
        .position(|l| !l.trim_start().starts_with("- "))
        .map_or(lines.len(), |i| head + 1 + i);
    Some((head, end))
}

pub fn move_to_facts(md: &str, file: &str, fallback: &str) -> String {
    let mut lines: Vec<String> = split(md).into_iter().map(String::from).collect();
    if let Some((head, end)) = facts_range(&lines) {
        if lines[head + 1..end].iter().any(|l| links_to(l, file)) {
            return md.to_string();
        }
    }
    let line = lines
        .iter()
        .find(|l| links_to(l, file))
        .cloned()
        .unwrap_or_else(|| fallback.to_string());
    lines.retain(|l| !links_to(l, file));
    match facts_range(&lines) {
        Some((_, end)) => lines.insert(end, line),
        None => {
            let at = usize::from(lines.first().is_some_and(|l| l.starts_with("# ")));
            let mut block = vec![FACTS_HEADING.to_string(), line];
            if at < lines.len() {
                block.push(String::new());
            }
            if at == 1 {
                block.insert(0, String::new());
            }
            lines.splice(at..at, block);
        }
    }
    while lines.last().is_some_and(String::is_empty) {
        lines.pop();
    }
    join(&lines, eol(md), true)
}

pub fn move_out_of_facts(md: &str, file: &str) -> String {
    let mut lines: Vec<String> = split(md).into_iter().map(String::from).collect();
    let Some((head, end)) = facts_range(&lines) else {
        return md.to_string();
    };
    let Some(i) = (head + 1..end).find(|&i| links_to(&lines[i], file)) else {
        return md.to_string();
    };
    let line = lines.remove(i);
    if end - head == 2 {
        lines.remove(head);
        if lines.get(head).is_some_and(|l| l.trim().is_empty()) {
            lines.remove(head);
        }
    }
    append_line(&join(&lines, eol(md), true), &line)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn moves_lines_into_and_out_of_facts() {
        let md = "# Память\n- [A](a.md) — а\n- [B](b.md) — б\n";
        let with = move_to_facts(md, "b.md", "- [b](b.md)");
        assert_eq!(
            with,
            "# Память\n\n## Факты\n- [B](b.md) — б\n\n- [A](a.md) — а\n"
        );
        assert_eq!(move_to_facts(&with, "b.md", "x"), with);
        let two = move_to_facts(&with, "a.md", "x");
        assert_eq!(
            two,
            "# Память\n\n## Факты\n- [B](b.md) — б\n- [A](a.md) — а\n"
        );
        let back = move_out_of_facts(&two, "a.md");
        assert_eq!(
            back,
            "# Память\n\n## Факты\n- [B](b.md) — б\n\n- [A](a.md) — а\n"
        );
        let none = move_out_of_facts(&back, "b.md");
        assert_eq!(none, "# Память\n\n- [A](a.md) — а\n- [B](b.md) — б\n");
        assert_eq!(
            move_to_facts("", "c.md", "- [c](c.md)"),
            "## Факты\n- [c](c.md)\n"
        );
    }

    const MD: &str = "# Память\r\n- [A](a.md) — про а\r\n- [B](b.md) — про б\r\n\r\n<!-- memory:sessions -->\r\n- s\r\n<!-- /memory:sessions -->\r\n";

    #[test]
    fn removes_only_the_linked_line_and_keeps_crlf() {
        assert_eq!(
            remove_links(MD, "a.md"),
            "# Память\r\n- [B](b.md) — про б\r\n\r\n<!-- memory:sessions -->\r\n- s\r\n<!-- /memory:sessions -->\r\n"
        );
        assert_eq!(remove_links(MD, "zzz.md"), MD);
    }

    #[test]
    fn appends_above_the_sessions_block() {
        let out = append_line(MD, "- [C](c.md) — про в");
        assert!(out.contains(
            "- [B](b.md) — про б\r\n- [C](c.md) — про в\r\n\r\n<!-- memory:sessions -->"
        ));
        assert_eq!(append_line("", "- x"), "- x\n");
        assert_eq!(append_line("- a\n", "- b"), "- a\n- b\n");
    }

    #[test]
    fn formats_lines() {
        assert_eq!(line_for("a", "a.md", "x"), "- [a](a.md) — x");
        assert_eq!(line_for("a", "a.md", ""), "- [a](a.md)");
    }
}
