use serde_json::{Map, Value};

pub struct Parsed {
    pub fields: Map<String, Value>,
    pub body: String,
}

pub fn parse(text: &str) -> Result<Parsed, String> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut lines = text.split_inclusive('\n');
    let no_block = || Parsed {
        fields: Map::new(),
        body: text.to_string(),
    };
    match lines.next() {
        Some(first) if first.trim_end() == "---" => {}
        _ => return Ok(no_block()),
    }
    let mut yaml = String::new();
    let mut consumed = text.split_inclusive('\n').next().map_or(0, str::len);
    let mut closed = false;
    for line in lines {
        consumed += line.len();
        if line.trim_end() == "---" {
            closed = true;
            break;
        }
        yaml.push_str(line);
    }
    if !closed {
        return Ok(no_block());
    }
    let body = text[consumed..].to_string();
    let fields = match strict_yaml(&yaml) {
        Ok(fields) => fields,
        Err(e) => {
            let loose = loose_lines(&yaml);
            if !loose.contains_key("name") && !loose.contains_key("description") {
                return Err(e);
            }
            loose
        }
    };
    Ok(Parsed { fields, body })
}

fn strict_yaml(yaml: &str) -> Result<Map<String, Value>, String> {
    let value: serde_yaml::Value =
        serde_yaml::from_str(yaml).map_err(|e| format!("front matter: {e}"))?;
    match value {
        serde_yaml::Value::Null => Ok(Map::new()),
        serde_yaml::Value::Mapping(_) => match serde_json::to_value(&value) {
            Ok(Value::Object(map)) => Ok(map),
            Ok(_) => Err("front matter: not a mapping".into()),
            Err(e) => Err(format!("front matter: {e}")),
        },
        _ => Err("front matter: not a mapping".into()),
    }
}

fn loose_lines(yaml: &str) -> Map<String, Value> {
    yaml.lines()
        .filter(|l| !l.starts_with([' ', '\t', '-', '#']))
        .filter_map(|l| l.split_once(':'))
        .filter(|(k, _)| !k.is_empty() && !k.contains(' '))
        .map(|(k, v)| {
            let v = v.trim().trim_matches(['"', '\'']);
            (k.to_string(), Value::String(v.to_string()))
        })
        .collect()
}

pub fn string_field(fields: &Map<String, Value>, key: &str) -> Option<String> {
    fields
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
}

pub fn first_paragraph_line(body: &str) -> Option<String> {
    body.lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with('#') && !l.starts_with("```"))
        .map(|l| l.chars().take(240).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_block_with_crlf_and_bom() {
        let p = parse("\u{feff}---\r\nname: a\r\ndescription: b c\r\n---\r\nbody\r\n").unwrap();
        assert_eq!(string_field(&p.fields, "name").as_deref(), Some("a"));
        assert_eq!(
            string_field(&p.fields, "description").as_deref(),
            Some("b c")
        );
        assert_eq!(p.body, "body\r\n");
    }

    #[test]
    fn no_block_is_not_an_error() {
        let p = parse("# Title\n\nText").unwrap();
        assert!(p.fields.is_empty());
        assert_eq!(first_paragraph_line(&p.body).as_deref(), Some("Text"));
    }

    #[test]
    fn dashes_inside_body_stay_in_body() {
        let p = parse("---\nname: a\n---\none\n---\ntwo\n").unwrap();
        assert_eq!(p.body, "one\n---\ntwo\n");
    }

    #[test]
    fn broken_yaml_is_an_error() {
        assert!(parse("---\nfoo: [a\n---\n").is_err());
        assert!(parse("---\n- a\n---\n").is_err());
    }

    #[test]
    fn unquoted_colon_falls_back_to_plain_lines() {
        let p = parse("---\nname: kb\ndescription: Tools: search, trace\n---\n").unwrap();
        assert_eq!(string_field(&p.fields, "name").as_deref(), Some("kb"));
        assert_eq!(
            string_field(&p.fields, "description").as_deref(),
            Some("Tools: search, trace")
        );
    }

    #[test]
    fn unclosed_block_is_treated_as_body() {
        let p = parse("---\nname: a\n").unwrap();
        assert!(p.fields.is_empty());
    }
}
