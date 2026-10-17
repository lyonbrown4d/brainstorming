use serde_json::{Value, json};
pub fn workbook() -> Value {
    json!({
      "format": "brainstorming",
      "version": 2,
      "id": "workbook",
      "title": "测试",
      "sheets": [
        {
          "id": "sheet-a",
          "name": "👩‍👩‍👧‍👦".repeat(40),
          "document": {
            "format": "brainstorming",
            "version": 1,
            "id": "document-a",
            "title": "中心",
            "rootId": "root",
            "topics": {
              "root": {
                "id": "root",
                "title": "中心",
                "collapsed": false,
                "side": "right",
                "children": [
                  "b",
                  "a"
                ]
              },
              "a": {
                "id": "a",
                "title": "左主题",
                "collapsed": false,
                "side": "left",
                "children": [],
                "notes": "备注",
            "style":{"fill":"#aabbcc","color":"#112233","fontSize":20,"bold":true,"italic":true,"shape":"ellipse","lineStyle":"straight","lineWidth":2},
                "metadata": {
                  "labels": [
                    "研究"
                  ],
                  "task": {
                    "done": false,
                    "priority": 2,
                    "progress": 20,
                "start":"2026-10-15",
                "due":"2026-11-15",
                "assignee":"测试成员",
                    "dependencies": [
                      "b"
                    ]
                  }
                }
              },
              "b": {
                "id": "b",
                "title": "右主题",
                "collapsed": true,
                "side": "right",
                "children": [],
                "metadata": {
                  "richTitle": "<p>内容</p>",
                  "notesFormat": "markdown"
                }
              }
            },
            "relations": [
              {
                "id": "rel",
                "from": "a",
                "to": "b",
                "title": "关联",
                "arrow": "both",
                "dashed": true,
              "color":"#123456",
              "width":2
              }
            ],
            "groups": [
              {
                "id": "group",
                "topicIds": [
                  "b",
                  "a"
                ],
                "kind": "summary",
                "title": "概要",
              "color":"#234567"
              }
            ],
            "callouts": [
              {
                "id": "callout",
                "topicId": "a",
                "text": "说明"
              }
            ],
            "presentation": [
              {
                "topicId": "b",
                "camera": {
                  "position": [
                    1,
                    2,
                    3
                  ],
                  "target": [
                    0,
                    0,
                    0
                  ]
                }
              }
            ],
            "floatingIds": [
              "b"
            ],
            "floatingPositions": {
              "b": {
                "x": 12.5,
                "y": -20
              }
            },
            "settings": {
              "theme": "night",
            "background":"#ffffff",
            "fontFamily":"system-ui",
            "lineWidth":2,
              "layout": "fishbone",
              "customPalette": {
                "name": "调色",
                "root": "#000000",
                "branches": [
                  "#111111",
                  "#222222",
                  "#333333",
                  "#444444",
                  "#555555"
                ],
                "background": "#ffffff"
              }
            }
          }
        },
        {
          "id": "sheet-b",
          "name": "画布 B",
          "document": {
            "format": "brainstorming",
            "version": 1,
            "id": "document-b",
            "title": "另一个中心",
            "rootId": "root",
            "topics": {
              "root": {
                "id": "root",
                "title": "另一个中心",
                "collapsed": false,
                "side": "right",
                "children": [],
                "metadata": {
                  "link": {
                    "kind": "topic",
                    "sheetId": "sheet-a",
                    "topicId": "a"
                  }
                }
              }
            },
            "assets": {}
          }
        }
      ]
    })
}
