# Post metadata

Handwritten Publish stores post metadata with the document rather than treating it as temporary publisher-form state.

## Summary

`summary` is optional plain text. For Micro.blog it is sent as the Micropub `summary` property. Clearing the field removes the summary on the next tracked-post update.

## Categories

`categories` is an optional array of category names. Handwritten Publish can query the selected Micro.blog destination for its existing categories and lets the user reuse them or enter new category names. Micro.blog creates a category automatically when a new category name is assigned to a post.

Categories are normalized for publishing by trimming empty values, removing duplicates, and treating order as insignificant for change detection.

## Persistence and safety

Summary and categories are persisted in IndexedDB and the `.hwpublish` manifest. They are included in Micro.blog-visible revision detection, so changing only metadata makes a tracked draft/post eligible for sync without forcing page-media re-upload.

The existing draft-first and published-update confirmation rules are unchanged.
