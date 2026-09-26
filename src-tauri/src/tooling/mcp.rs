use std::collections::BTreeMap;
use std::path::Path;

use serde_json::{Map, Value};

use super::scan::Namespace;
use super::{Kind, McpInfo, Origin, ToolItem};

fn string_map(value: Option<&Value>) -> BTreeMap<String, String> {
    value
        .and_then(Value::as_object)
        .map(|m| {
            m.iter()
                .map(|(k, v)| {
                    let s = v.as_str().map_or_else(|| v.to_string(), String::from);
                    (k.clone(), s)
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn servers(
    map: Option<&Value>,
    origin: Origin,
    file: &Path,
    declared_in: &str,
    ns: Option<&Namespace>,
) -> Vec<ToolItem> {
    let Some(map) = map.and_then(Value::as_object) else {
        return Vec::new();
    };
    map.iter()
        .map(|(name, cfg)| server(name, cfg, origin, file, declared_in, ns))
        .collect()
}

fn server(
    name: &str,
    cfg: &Value,
    origin: Origin,
    file: &Path,
    declared_in: &str,
    ns: Option<&Namespace>,
) -> ToolItem {
    let empty = Map::new();
    let obj = cfg.as_object().unwrap_or(&empty);
    let url = obj.get("url").and_then(Value::as_str).map(String::from);
    let transport = obj
        .get("type")
        .and_then(Value::as_str)
        .map(String::from)
        .unwrap_or_else(|| if url.is_some() { "http" } else { "stdio" }.into());
    let args = obj
        .get("args")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .map(|v| v.as_str().map_or_else(|| v.to_string(), String::from))
                .collect()
        })
        .unwrap_or_default();
    let qualified = match ns {
        Some(n) => format!("{}:{name}", n.plugin_name),
        None => name.to_string(),
    };
    let mut item = ToolItem::new(Kind::Mcp, origin, name.to_string(), qualified);
    item.file_path = Some(file.to_string_lossy().into_owned());
    item.plugin_key = ns.map(|n| n.plugin_key.to_string());
    item.mcp = Some(McpInfo {
        transport,
        command: obj.get("command").and_then(Value::as_str).map(String::from),
        args,
        url,
        env: string_map(obj.get("env")),
        headers: string_map(obj.get("headers")),
        declared_in: declared_in.to_string(),
    });
    item
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_stdio_and_http_servers() {
        let map = json!({
            "fs": { "command": "npx", "args": ["-y", "fs"], "env": { "TOKEN": "s3cret", "N": 1 } },
            "remote": { "url": "https://x/mcp", "headers": { "Authorization": "Bearer t" } },
            "sse": { "type": "sse", "url": "https://y" }
        });
        let items = servers(
            Some(&map),
            Origin::Local,
            Path::new("C:\\h\\.claude.json"),
            "~/.claude.json › projects › C:\\p › mcpServers",
            None,
        );
        assert_eq!(items.len(), 3);
        let fs = items.iter().find(|i| i.name == "fs").unwrap();
        let info = fs.mcp.as_ref().unwrap();
        assert_eq!(info.transport, "stdio");
        assert_eq!(info.args, vec!["-y", "fs"]);
        assert_eq!(info.env.get("N").map(String::as_str), Some("1"));
        assert_eq!(fs.id, "mcp:local:fs");
        let remote = items.iter().find(|i| i.name == "remote").unwrap();
        assert_eq!(remote.mcp.as_ref().unwrap().transport, "http");
        let sse = items.iter().find(|i| i.name == "sse").unwrap();
        assert_eq!(sse.mcp.as_ref().unwrap().transport, "sse");
    }

    #[test]
    fn missing_map_gives_nothing() {
        assert!(servers(None, Origin::User, Path::new("x"), "x", None).is_empty());
    }
}
