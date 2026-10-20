use serde_json::Value;

pub fn field<'a>(value: &'a Value, key: &str) -> &'a str {
  value.get(key).and_then(Value::as_str).unwrap_or("")
}

pub fn number(value: &Value, key: &str, fallback: f64) -> f64 {
  value
    .get(key)
    .and_then(Value::as_f64)
    .filter(|n| n.is_finite())
    .unwrap_or(fallback)
}

pub fn escape(value: &str) -> String {
  let mut result = String::with_capacity(value.len());
  for ch in value.chars() {
    match ch {
      '&' => result.push_str("&amp;"),
      '<' => result.push_str("&lt;"),
      '>' => result.push_str("&gt;"),
      '"' => result.push_str("&quot;"),
      '\'' => result.push_str("&apos;"),
      c if c.is_control() && !matches!(c, '\n' | '\t' | '\r') => {}
      c => result.push(c),
    }
  }
  result
}

pub fn color(value: &str, fallback: &str) -> String {
  let valid = value.starts_with('#')
    && matches!(value.len(), 4 | 5 | 7 | 9)
    && value[1..].bytes().all(|byte| byte.is_ascii_hexdigit());
  if valid {
    value.to_owned()
  } else {
    fallback.to_owned()
  }
}

pub fn path(value: &str) -> Result<&str, String> {
  if value.len() > 4 * 1024 * 1024
    || !value.bytes().all(|byte| {
      byte.is_ascii_whitespace()
        || byte.is_ascii_digit()
        || matches!(
          byte,
          b'.'
            | b','
            | b'-'
            | b'+'
            | b'e'
            | b'E'
            | b'M'
            | b'm'
            | b'L'
            | b'l'
            | b'H'
            | b'h'
            | b'V'
            | b'v'
            | b'C'
            | b'c'
            | b'Q'
            | b'q'
            | b'S'
            | b's'
            | b'T'
            | b't'
            | b'A'
            | b'a'
            | b'Z'
            | b'z'
        )
    })
  {
    return Err("SVG 路径包含非法字符".into());
  }
  Ok(value)
}

pub fn fmt(n: f64) -> String {
  if n.is_finite() {
    format!("{n:.2}")
  } else {
    "0".into()
  }
}

pub struct Svg(pub String);

impl Svg {
  pub fn element(&mut self, name: &str, attributes: &[(&str, String)]) {
    self.0.push('<');
    self.0.push_str(name);
    for (key, value) in attributes {
      self.0.push(' ');
      self.0.push_str(key);
      self.0.push_str("=\"");
      self.0.push_str(&escape(value));
      self.0.push('"');
    }
    self.0.push_str("/>");
  }
  pub fn text(&mut self, value: &str, attributes: &[(&str, String)]) {
    self.0.push_str("<text");
    for (key, value) in attributes {
      self.0.push(' ');
      self.0.push_str(key);
      self.0.push_str("=\"");
      self.0.push_str(&escape(value));
      self.0.push('"');
    }
    self.0.push('>');
    self.0.push_str(&escape(value));
    self.0.push_str("</text>");
  }
}
