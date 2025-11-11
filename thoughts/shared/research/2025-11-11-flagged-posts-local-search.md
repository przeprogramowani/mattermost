---
date: 2025-11-11T17:53:41Z
researcher: Claude Code
git_commit: 0c1a41fa3caa7cb14792f1f676b058cb942f13a2
branch: 10x-method
repository: mattermost
topic: "Local search within flagged posts in RHS panel"
tags: [research, codebase, flagged-posts, search, rhs, client-side-filtering]
status: complete
last_updated: 2025-11-11
last_updated_by: Claude Code
---

# Research: Local Search Within Flagged Posts in RHS Panel

**Date**: 2025-11-11T17:53:41Z
**Researcher**: Claude Code
**Git Commit**: 0c1a41fa3caa7cb14792f1f676b058cb942f13a2
**Branch**: 10x-method
**Repository**: mattermost

## Research Question

How can we introduce local search within flagged posts to allow users to quickly discover matching flagged posts? The search should be only related to flagged posts within the right-hand side (RHS) panel.

## Summary

After comprehensive research of the Mattermost webapp codebase, I've identified clear patterns and existing utilities that can be used to implement local search for flagged posts. The implementation should:

1. **Use the Input widget component** with search icon prefix and clear button suffix (pattern from `channel_members_rhs/search.tsx`)
2. **Implement client-side filtering** using existing text search utilities (`parseSearchTerms`, `formatText` from `utils/text_formatting.tsx`)
3. **Use local state with useMemo** for filtering flagged posts by search term
4. **Add debounced search** (100ms) following Mattermost patterns
5. **Place search input** between `SearchResultsHeader` and `PostListCore` components
6. **Filter posts by message content** matching against post.message field

The flagged posts are already available as full Post objects via the `getFlaggedPosts` selector, making client-side filtering straightforward.

## Detailed Findings

### Component Architecture

#### Current FlaggedPostsContainer Structure
**File**: `webapp/channels/src/components/flagged_posts_container/flagged_posts_container.tsx`

Current component structure (lines 149-180):
```tsx
return (
    <div className='FlaggedPostsContainer SearchResults sidebar-right__body'>
        <SearchResultsHeader>
            <h2 id='rhsPanelTitle'>{formattedTitle}</h2>
        </SearchResultsHeader>
        <SearchLimitsBanner searchType='messages'/>
        <PostListCore
            items={posts}
            renderItem={renderItem}
            // ... other props
        />
    </div>
);
```

**Proposed addition**: Insert search input between `SearchResultsHeader` and `SearchLimitsBanner`.

#### Data Flow
- **Redux state**: Full `Post[]` array from `getFlaggedPosts(state)` selector
- **Post structure**: Each post has `message` property with text content
- **Current filtering**: None - all flagged posts displayed
- **Proposed filtering**: Client-side filter on `posts` array before passing to `PostListCore`

### Search Input UI Pattern

#### Recommended Pattern: Channel Members RHS Search
**File**: `webapp/channels/src/components/channel_members_rhs/search.tsx:37-49`

```tsx
<Input
    data-testid='channel-member-rhs-search'
    value={terms}
    onInput={(e) => onInput(e.currentTarget.value)}
    inputPrefix={<i className={'icon icon-magnify'}/>}
    inputSuffix={inputSuffix}  // Clear button when has value
    placeholder={formatMessage({
        id: 'channel_members_rhs.search_bar.placeholder',
        defaultMessage: 'Search members',
    })}
    useLegend={false}
/>
```

**Container styling** (`channel_members_rhs/search.tsx:53-60`):
```tsx
const Container = styled.div`
    padding: 0px 20px 12px;
`;
```

**Why this pattern**:
- Simple, clean implementation
- Uses reusable `Input` widget component
- Follows Mattermost RHS search patterns
- Minimal code, consistent with existing UI

**Alternative**: Could use `SearchBox` from `new_search/search_box.tsx`, but it's heavier with team selectors and type toggles - overkill for local filtering.

### Text Search and Filtering Utilities

#### parseSearchTerms Function
**File**: `webapp/channels/src/utils/text_formatting.tsx:906-969`

Parses search query into individual terms:
- Handles quoted phrases: `"exact phrase"` → `["exact phrase"]`
- Filters out search flags: `in:`, `from:`, `channel:`, `on:`, `before:`, `after:`
- Captures @mentions with special handling
- Splits on spaces and special characters

**Usage**:
```typescript
import {parseSearchTerms} from 'utils/text_formatting';

const terms = parseSearchTerms('hello "exact phrase" from:john');
// Returns: ['hello', 'exact phrase']
// (from:john filtered out)
```

#### formatText Function
**File**: `webapp/channels/src/utils/text_formatting.tsx:281-450`

Main formatting function with search highlighting support:
- Accepts `searchTerm` string or `searchMatches` array
- Automatically converts terms to regex patterns
- Highlights matches with `<span class="search-highlight">`
- Integrates with markdown rendering

**Usage**:
```typescript
import {formatText} from 'utils/text_formatting';

const highlighted = formatText(post.message, {
    searchTerm: 'hello',
    atMentions: true,
}, emojiMap);
// Returns: HTML with <span class="search-highlight">hello</span>
```

#### Simple Text Matching (Recommended)
For basic filtering without highlighting, use standard JavaScript:

```typescript
const searchTerm = 'hello';
const filteredPosts = posts.filter(post =>
    post.message.toLowerCase().includes(searchTerm.toLowerCase())
);
```

For multi-term search:
```typescript
import {parseSearchTerms} from 'utils/text_formatting';

const terms = parseSearchTerms(searchTerm);
const filteredPosts = posts.filter(post => {
    const message = post.message.toLowerCase();
    return terms.every(term => message.includes(term.toLowerCase()));
});
```

### Client-Side Filtering Patterns

#### Pattern 1: useMemo for Performance
**Example**: `channel_invite_modal/channel_invite_modal.tsx:174-225`

```typescript
const [searchTerm, setSearchTerm] = useState('');

const filteredPosts = useMemo(() => {
    if (!searchTerm) {
        return posts;  // No filter, return all
    }

    const lowerTerm = searchTerm.toLowerCase();
    return posts.filter(post =>
        post.message.toLowerCase().includes(lowerTerm)
    );
}, [posts, searchTerm]);
```

**Why useMemo**: Prevents re-filtering on every render, only when `posts` or `searchTerm` change.

#### Pattern 2: Debounced Search
**Example**: `channel_invite_modal/channel_invite_modal.tsx:336-377`

```typescript
const searchTimeoutId = useRef<number>(0);

const handleSearchChange = useCallback((value: string) => {
    clearTimeout(searchTimeoutId.current);

    searchTimeoutId.current = window.setTimeout(() => {
        setSearchTerm(value);
    }, Constants.SEARCH_TIMEOUT_MILLISECONDS); // 100ms
}, []);

useEffect(() => {
    return () => clearTimeout(searchTimeoutId.current);
}, []);
```

**Why debounce**: For client-side filtering of posts, debouncing is optional but recommended to avoid excessive re-renders while typing.

**Note**: For flagged posts, debouncing may not be necessary since we're filtering locally (not calling API). Consider immediate filtering for better UX.

### Redux State and Data Access

#### Flagged Posts Selector
**File**: `webapp/channels/src/packages/mattermost-redux/src/selectors/entities/posts.ts:344-356`

```typescript
export const getFlaggedPosts: (state: GlobalState) => Post[] = createSelector(
    'getFlaggedPosts',
    getAllPosts,  // state.entities.posts.posts
    (state: GlobalState) => state.entities.search.flagged,  // Post IDs
    (posts, postIds) => {
        if (!postIds) {
            return [];
        }
        return postIds.map((id) => posts[id]).filter((post) => post);
    },
);
```

**Returns**: Full `Post[]` array with all post data

**Post Structure**:
```typescript
type Post = {
    id: string;
    message: string;           // Main content to search
    channel_id: string;
    user_id: string;
    create_at: number;
    update_at: number;
    delete_at: number;
    // ... other fields
}
```

**Key insight**: No need to fetch additional data - the selector already provides full Post objects with `message` field ready for filtering.

#### Related Selectors
**File**: `webapp/channels/src/selectors/rhs.ts`

```typescript
// Used in FlaggedPostsContainer
getFlaggedPosts(state)           // lines 256-258: Returns Post[]
getIsSearchingFlaggedPost(state) // Loading state
getIsGettingMoreFlaggedPosts(state) // Pagination loading
getIsFlaggedAtEnd(state)         // End of results
```

### Implementation Approach

Based on the research, here's the recommended implementation approach:

#### 1. Add Search Input Component

Create a search input component between header and content:

```tsx
// Add state
const [searchTerm, setSearchTerm] = useState('');

// Add clear button logic
const inputSuffix = searchTerm ? (
    <button
        className='btn btn-sm input-clear-x'
        onClick={() => setSearchTerm('')}
    >
        <i className='icon icon-close-circle'/>
        <FormattedMessage id='search_bar.clear' defaultMessage='Clear'/>
    </button>
) : null;

// Search input (place after SearchResultsHeader)
<div style={{padding: '0px 20px 12px'}}>
    <Input
        data-testid='flagged-posts-search'
        value={searchTerm}
        onInput={(e) => setSearchTerm(e.currentTarget.value)}
        inputPrefix={<i className='icon icon-magnify'}/>}
        inputSuffix={inputSuffix}
        placeholder={intl.formatMessage({
            id: 'flagged_posts.search_bar.placeholder',
            defaultMessage: 'Search saved messages',
        })}
        useLegend={false}
    />
</div>
```

#### 2. Filter Posts with useMemo

```tsx
const filteredPosts = useMemo(() => {
    if (!searchTerm.trim()) {
        return posts;  // No search term, show all
    }

    const lowerTerm = searchTerm.toLowerCase();
    return posts.filter(post =>
        post.message.toLowerCase().includes(lowerTerm)
    );
}, [posts, searchTerm]);
```

#### 3. Update PostListCore Props

Change from:
```tsx
<PostListCore items={posts} ... />
```

To:
```tsx
<PostListCore items={filteredPosts} ... />
```

#### 4. Update Empty State

Update `renderEmpty()` to distinguish between "no flagged posts" vs "no search results":

```tsx
const renderEmpty = () => {
    const hasSearchTerm = searchTerm.trim().length > 0;

    const noResultsProps = {
        variant: hasSearchTerm
            ? NoResultsVariant.ChannelSearch  // Search returned nothing
            : NoResultsVariant.FlaggedPosts,   // No flagged posts at all
        titleValues: hasSearchTerm ? {channelName: searchTerm} : undefined,
        subtitleValues: hasSearchTerm ? undefined : {
            buttonText: <strong>{
                intl.formatMessage({
                    id: 'flag_post.flag',
                    defaultMessage: 'Save Message',
                })
            }</strong>,
        },
    };

    return (
        <div className='sidebar--right__subheader a11y__section'>
            <NoResultsIndicator
                style={{padding: '48px'}}
                {...noResultsProps}
            />
        </div>
    );
};
```

### Advanced Features (Optional)

#### Multi-term Search
Use `parseSearchTerms` for advanced search:

```tsx
import {parseSearchTerms} from 'utils/text_formatting';

const filteredPosts = useMemo(() => {
    if (!searchTerm.trim()) {
        return posts;
    }

    const terms = parseSearchTerms(searchTerm);
    if (terms.length === 0) {
        return posts;
    }

    return posts.filter(post => {
        const message = post.message.toLowerCase();
        // All terms must match
        return terms.every(term =>
            message.includes(term.toLowerCase())
        );
    });
}, [posts, searchTerm]);
```

#### Search Highlighting
To highlight search matches in posts, pass `searchTerm` to `PostSearchResultsItem`:

**Current** (line 88-98):
```tsx
<PostSearchResultsItem
    post={post}
    matches={[]}
    searchTerm={''}  // Currently empty
    isFlaggedPosts={true}
    // ...
/>
```

**Updated**:
```tsx
<PostSearchResultsItem
    post={post}
    matches={[]}
    searchTerm={searchTerm}  // Pass actual search term
    isFlaggedPosts={true}
    // ...
/>
```

The `PostSearchResultsItem` component already handles highlighting via `formatText()` internally.

## Code References

### Key Files for Implementation

1. **FlaggedPostsContainer** (to modify)
   - `webapp/channels/src/components/flagged_posts_container/flagged_posts_container.tsx`
   - Lines 149-180: Current render structure
   - Add search input after line 158 (after SearchResultsHeader)

2. **Search Input Pattern Reference**
   - `webapp/channels/src/components/channel_members_rhs/search.tsx:37-60`
   - Simple, clean search input with Input widget

3. **Text Search Utilities**
   - `webapp/channels/src/utils/text_formatting.tsx:906-969` - parseSearchTerms
   - `webapp/channels/src/utils/text_formatting.tsx:281-450` - formatText

4. **Client-Side Filtering Examples**
   - `webapp/channels/src/components/channel_invite_modal/channel_invite_modal.tsx:174-225` - useMemo pattern
   - `webapp/channels/src/components/channel_invite_modal/channel_invite_modal.tsx:336-377` - Debounced search

5. **Redux Selectors**
   - `webapp/channels/src/packages/mattermost-redux/src/selectors/entities/posts.ts:344-356` - getFlaggedPosts
   - `webapp/channels/src/selectors/rhs.ts:256-258` - Wrapper selector

6. **Input Widget Component**
   - `webapp/channels/src/components/widgets/inputs/input/input.tsx:1-322`

## Architecture Insights

### Design Patterns Observed

1. **Separation of Concerns**
   - Search input is separate from list rendering
   - Filtering happens before data reaches PostListCore
   - PostListCore remains pure and unaware of filtering

2. **Performance Optimization**
   - `useMemo` prevents unnecessary re-filtering
   - Selector memoization in Redux (getFlaggedPosts)
   - Optional debouncing for smooth typing experience

3. **Consistent UI Patterns**
   - Search inputs in RHS follow consistent pattern:
     - Magnify icon prefix
     - Clear button suffix when has value
     - Padding: `0px 20px 12px`
     - Placeholder text

4. **Graceful Degradation**
   - Empty search term shows all posts
   - Different empty states for "no posts" vs "no search results"
   - Clear button for easy reset

### Integration Points

**No breaking changes needed**:
- Uses existing `Input` widget component
- Uses existing text formatting utilities
- Uses existing Redux selectors
- Adds filtering layer before PostListCore

**Minimal code changes**:
- Add 3 lines: useState for searchTerm
- Add ~20 lines: Search input JSX
- Add ~10 lines: useMemo filtering
- Update 2 lines: Pass filteredPosts instead of posts
- Update ~20 lines: renderEmpty() conditional logic

**Total: ~55 lines of code**

## Historical Context (from thoughts/)

**Recent Refactor**: `thoughts/shared/plans/2025-11-11-saved-posts-decoupling-implementation.md`

The FlaggedPostsContainer was recently decoupled from the monolithic SearchResults component as part of Phase 2 of a larger refactoring effort. The refactor:
- Extracted PostListCore as a pure component
- Created dedicated FlaggedPostsContainer
- Separated concerns (search, pinned, flagged)
- Made each feature independently maintainable

**Key principles from refactor**:
- PostListCore has zero conditionals
- Each container owns its feature logic
- Render props pattern for flexibility
- Single responsibility

**Adding search aligns with these principles**:
- Search is a feature of the flagged posts container
- Filtering happens before data reaches PostListCore
- No changes needed to PostListCore itself
- Clean separation of concerns maintained

## Related Research

No prior research documents found for flagged posts search functionality. This is the first documented research on this topic.

## Open Questions

1. **Debouncing**: Should we debounce the search input?
   - **Recommendation**: No, for client-side filtering immediate response is better UX
   - Debouncing is more useful for API calls

2. **Search scope**: Should we search only `post.message` or include other fields?
   - **Recommendation**: Start with `post.message` only (main content)
   - Future: Could expand to search user names, channel names, etc.

3. **Search syntax**: Should we support advanced search (quoted phrases, operators)?
   - **Recommendation**: Use `parseSearchTerms` for consistency with main search
   - Supports quoted phrases out of the box

4. **Highlighting**: Should search matches be highlighted in posts?
   - **Recommendation**: Yes, pass `searchTerm` to PostSearchResultsItem
   - Component already supports it via formatText()

5. **Persistence**: Should search term persist when navigating away and back?
   - **Recommendation**: No, reset search term on unmount (simpler, clearer UX)
   - User expects fresh view when reopening flagged posts

6. **Empty state**: What message for "no search results"?
   - **Recommendation**: Use `NoResultsVariant.ChannelSearch` with search term
   - Shows "No results for '{searchTerm}'" (existing pattern)

7. **Accessibility**: Screen reader announcements for search results count?
   - **Recommendation**: Add aria-live region announcing "{count} results"
   - Follow pattern from main search results

## Implementation Checklist

- [ ] Add useState for searchTerm
- [ ] Add search Input component with magnify icon and clear button
- [ ] Add useMemo for filtering posts by searchTerm
- [ ] Update PostListCore items prop to use filteredPosts
- [ ] Update renderEmpty() to handle search vs no posts states
- [ ] Pass searchTerm to PostSearchResultsItem for highlighting
- [ ] Add i18n key for search placeholder
- [ ] Test with no posts, with posts, with search matches, with no matches
- [ ] Test clear button functionality
- [ ] Test accessibility (keyboard navigation, screen reader)
- [ ] Update tests to cover search functionality
- [ ] Add visual regression test for search input

## Conclusion

Implementing local search for flagged posts is straightforward using existing Mattermost patterns and utilities. The implementation requires minimal code (~55 lines), integrates cleanly with the existing architecture, and follows established UI patterns. All necessary utilities and components already exist in the codebase.

The recommended approach:
1. Use Input widget with icon prefix/suffix pattern
2. Filter with useMemo for performance
3. Use simple string matching (or parseSearchTerms for advanced)
4. Update empty state to distinguish no posts vs no results
5. Pass searchTerm to posts for highlighting

This maintains the clean architecture from the recent refactor while adding valuable search functionality for users with many saved messages.
