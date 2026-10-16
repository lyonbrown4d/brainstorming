import {
  HEADING,
  QUOTE,
  UNORDERED_LIST,
  ORDERED_LIST,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
} from '@lexical/markdown'

// Only transformations backed by the installed official rich-text/list/link extensions.
export const richTransformers = [
  HEADING,
  QUOTE,
  UNORDERED_LIST,
  ORDERED_LIST,
  ...TEXT_FORMAT_TRANSFORMERS,
  ...TEXT_MATCH_TRANSFORMERS,
]
