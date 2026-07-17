# FlowTracker AI JSON Parsing Test

Use the JSON code block below as the only workflow source. Preserve the hierarchy and titles exactly. Do not convert this heading, these instructions, or the validation checklist into flowchart nodes.

```json
[
  {
    "title": "Discovery & Planning",
    "children": [
      {
        "title": "Confirm \"must-have\" requirements",
        "completed": false
      },
      {
        "title": "Stakeholder Research",
        "children": [
          {
            "title": "Interview the project sponsor",
            "completed": false
          },
          {
            "title": "Interview end users",
            "completed": false
          },
          {
            "title": "Findings Synthesis",
            "children": [
              {
                "title": "Cluster insights by theme",
                "completed": false
              },
              {
                "title": "Approve the research summary",
                "completed": false
              }
            ]
          }
        ]
      },
      {
        "title": "Define success metrics: quality, speed & adoption",
        "completed": false
      }
    ]
  },
  {
    "title": "Design & Build",
    "children": [
      {
        "title": "Experience Design",
        "children": [
          {
            "title": "Create the primary user flow",
            "completed": false
          },
          {
            "title": "Produce responsive wireframes",
            "completed": false
          },
          {
            "title": "Design Review",
            "children": [
              {
                "title": "Run accessibility check — WCAG 2.2 AA",
                "completed": false
              },
              {
                "title": "Approve the visual direction",
                "completed": false
              }
            ]
          }
        ]
      },
      {
        "title": "Implement the responsive interface",
        "completed": false
      },
      {
        "title": "Connect API responses / error states",
        "completed": false
      }
    ]
  },
  {
    "title": "Launch & Review",
    "children": [
      {
        "title": "Run the release checklist",
        "completed": false
      },
      {
        "title": "Publish v1.0 to production",
        "completed": false
      },
      {
        "title": "Post-launch Monitoring",
        "children": [
          {
            "title": "Review analytics after 7 days",
            "completed": false
          },
          {
            "title": "Record follow-up actions",
            "completed": false
          }
        ]
      }
    ]
  }
]
```

## Human validation checklist

The generated flowchart should contain:

- 3 phases, in the same order as the JSON.
- 16 leaf steps in total.
- 5 nested containers: Stakeholder Research, Findings Synthesis, Experience Design, Design Review, and Post-launch Monitoring.
- 2 deeper group containers: Findings Synthesis and Design Review.
- Every leaf initially incomplete.
- Exact preservation of quotes, ampersands, slashes, the em dash, `WCAG 2.2 AA`, and `v1.0`.
- No nodes created from this checklist or the introductory instructions.
