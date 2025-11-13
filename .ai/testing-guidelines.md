# Testing Guidelines for Mattermost React Components

This document outlines best practices for writing unit tests for React components in the Mattermost codebase, based on patterns established in the saved posts test implementation.

## Table of Contents

- [Core Principles](#core-principles)
- [Handling Async Operations](#handling-async-operations)
- [Redux State Setup](#redux-state-setup)
- [Mock Management](#mock-management)
- [Test Organization](#test-organization)
- [Common Patterns](#common-patterns)
- [Performance Considerations](#performance-considerations)
- [Debugging Tests](#debugging-tests)

---

## Core Principles

### 1. Use React Testing Library Properly

**Always wrap async render operations in `act()`:**

```typescript
// ✅ CORRECT
test('should render posts', async () => {
    await act(async () => {
        renderWithContext(<MyComponent/>, state);
    });

    await waitFor(() => {
        expect(screen.getByText('Content')).toBeInTheDocument();
    });
});

// ❌ INCORRECT - May cause act() warnings
test('should render posts', () => {
    renderWithContext(<MyComponent/>, state);
    expect(screen.getByText('Content')).toBeInTheDocument();
});
```

**Why?** Components that trigger async Redux updates need `act()` to ensure all updates complete before assertions run.

### 2. Wait for Async Updates

Use `waitFor()` for assertions that depend on async operations:

```typescript
// ✅ CORRECT
await waitFor(() => {
    expect(screen.getByText('Loaded Data')).toBeInTheDocument();
});

// ❌ INCORRECT - May fail intermittently
expect(screen.getByText('Loaded Data')).toBeInTheDocument();
```

### 3. Make Tests Async When Needed

If your test renders components with Redux or uses timers, make it async:

```typescript
// ✅ CORRECT
test('should handle user interaction', async () => {
    await act(async () => {
        renderWithContext(<Component/>, state);
    });
    // ... test logic
});

// ❌ INCORRECT - Missing async for act()
test('should handle user interaction', () => {
    act(async () => {  // This won't work properly without async test
        renderWithContext(<Component/>, state);
    });
});
```

---

## Handling Async Operations

### Rendering Components with Async Updates

```typescript
test('should render component with posts', async () => {
    const posts = [
        TestHelper.getPostMock({id: 'post1', message: 'Test post'}),
    ];

    const state: DeepPartial<GlobalState> = {
        entities: {
            posts: {
                posts: {post1: posts[0]},
            },
        },
    };

    // Wrap render in act()
    await act(async () => {
        renderWithContext(<Component/>, state);
    });

    // Wait for async updates to complete
    await waitFor(() => {
        expect(screen.getByText('Test post')).toBeInTheDocument();
    });
});
```

### Testing Debounced Operations

```typescript
test('should debounce search input', async () => {
    jest.useFakeTimers();

    const {getFlaggedPosts} = require('mattermost-redux/actions/search');

    await act(async () => {
        renderWithContext(<Component/>, state);
    });

    const input = screen.getByTestId('search-input');

    // Type quickly - should not dispatch immediately
    fireEvent.input(input, {target: {value: 'test'}});
    expect(getFlaggedPosts).not.toHaveBeenCalled();

    // Advance timers
    act(() => {
        jest.advanceTimersByTime(Constants.SEARCH_TIMEOUT_MILLISECONDS);
    });

    // Verify dispatch happened after debounce
    await waitFor(() => {
        expect(getFlaggedPosts).toHaveBeenCalledWith('test');
    });

    jest.useRealTimers();
});
```

### Testing User Interactions with Async Effects

```typescript
test('should handle button click', async () => {
    const mockAction = jest.fn(() => ({type: 'MOCK'}));

    await act(async () => {
        renderWithContext(<Component/>, state);
    });

    const button = screen.getByRole('button', {name: 'Submit'});

    // Wrap interaction in act() if it triggers state updates
    await act(async () => {
        fireEvent.click(button);
    });

    await waitFor(() => {
        expect(mockAction).toHaveBeenCalled();
    });
});
```

---

## Redux State Setup

### Use TypeScript for State Safety

```typescript
const baseState: DeepPartial<GlobalState> = {
    entities: {
        users: {
            currentUserId: 'user_id',
            profiles: {
                user_id: TestHelper.getUserMock({id: 'user_id'}),
            },
        },
        teams: {
            currentTeamId: 'team_id',
            teams: {
                team_id: TestHelper.getTeamMock({id: 'team_id'}),
            },
        },
        channels: {
            currentChannelId: 'channel_id',
            channels: {
                channel_id: TestHelper.getChannelMock({id: 'channel_id'}),
            },
        },
        posts: {
            posts: {},
            postsInChannel: {},
        },
        preferences: {
            myPreferences: {},
        },
        general: {
            config: {},
        },
    },
};
```

### Minimal State Principle

Only include state slices your component actually needs:

```typescript
// ✅ CORRECT - Only includes needed state
const state: DeepPartial<GlobalState> = {
    entities: {
        posts: {
            posts: {post1: mockPost},
        },
    },
};

// ❌ INCORRECT - Unnecessary state bloat
const state: DeepPartial<GlobalState> = {
    entities: {
        posts: {posts: {post1: mockPost}},
        users: {/* not needed */},
        teams: {/* not needed */},
        channels: {/* not needed */},
        // ... lots of unused state
    },
};
```

### Use TestHelper for Mock Data

```typescript
// ✅ CORRECT - Uses TestHelper
const post = TestHelper.getPostMock({
    id: 'post1',
    message: 'Test message',
    channel_id: 'channel_id',
});

// ❌ INCORRECT - Manual object creation (missing fields)
const post = {
    id: 'post1',
    message: 'Test message',
};
```

### Creating Multiple Test Objects

```typescript
const posts = Array.from({length: 20}, (_, i) =>
    TestHelper.getPostMock({
        id: `post${i}`,
        message: `Post ${i}`,
        create_at: Date.now() - (i * 1000),
        channel_id: 'channel_id',
    })
);

const postsById = posts.reduce((acc, p) => ({...acc, [p.id]: p}), {});
```

---

## Mock Management

### Module-Level Mocking

Mock Redux actions at the module level:

```typescript
// At the top of test file, before describe()
jest.mock('mattermost-redux/actions/search', () => ({
    getFlaggedPosts: jest.fn(() => ({type: 'MOCK_GET_FLAGGED'})),
    getMoreFlaggedPosts: jest.fn(() => ({type: 'MOCK_GET_MORE'})),
}));
```

### Clean Up Between Tests

```typescript
describe('MyComponent', () => {
    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers(); // If using fake timers
    });

    // ... tests
});
```

### Using Mocked Actions in Tests

```typescript
test('should dispatch action', async () => {
    // Get the mocked function
    const {getFlaggedPosts} = require('mattermost-redux/actions/search');

    // Clear any previous calls
    getFlaggedPosts.mockClear();

    await act(async () => {
        renderWithContext(<Component/>, state);
    });

    // Trigger action
    const button = screen.getByRole('button');
    await act(async () => {
        fireEvent.click(button);
    });

    // Verify it was called
    expect(getFlaggedPosts).toHaveBeenCalledWith('expected-arg');
});
```

### Mock Return Values

```typescript
// Success case
mockAction.mockReturnValue({type: 'SUCCESS', data: {...}});

// Error case
mockAction.mockReturnValue({
    type: 'ERROR',
    error: {message: 'Something failed'},
});

// Promise rejection
mockAction.mockRejectedValue(new Error('Network error'));
```

---

## Test Organization

### Describe Block Structure

Organize tests by functionality:

```typescript
describe('ComponentName', () => {
    const baseState = { /* ... */ };

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    describe('rendering', () => {
        test('should show loading state', () => { /* ... */ });
        test('should show empty state', () => { /* ... */ });
        test('should render items', async () => { /* ... */ });
    });

    describe('user interactions', () => {
        test('should handle button click', async () => { /* ... */ });
        test('should handle input change', async () => { /* ... */ });
    });

    describe('error handling', () => {
        test('should handle network error', async () => { /* ... */ });
        test('should show error message', async () => { /* ... */ });
    });

    describe('accessibility', () => {
        test('should have proper ARIA labels', () => { /* ... */ });
        test('should support keyboard navigation', () => { /* ... */ });
    });
});
```

### Test Naming

Use descriptive test names that explain behavior:

```typescript
// ✅ CORRECT - Clearly describes what is tested
test('should dispatch search action after debounce delay', async () => {});
test('should show error message when network request fails', async () => {});
test('should prevent duplicate pagination requests while loading', async () => {});

// ❌ INCORRECT - Vague or implementation-focused
test('test search', async () => {});
test('renders correctly', () => {});
test('calls useEffect', async () => {});
```

---

## Common Patterns

### Testing Loading States

```typescript
test('should show loading indicator', () => {
    const state: DeepPartial<GlobalState> = {
        ...baseState,
        views: {
            rhs: {
                isSearchingFlaggedPost: true,
            },
        },
    };

    renderWithContext(<Component/>, state);

    expect(screen.getByText('Loading')).toBeInTheDocument();
});
```

### Testing Empty States

```typescript
test('should show empty state when no data', () => {
    const state: DeepPartial<GlobalState> = {
        ...baseState,
        entities: {
            ...baseState.entities,
            search: {
                flagged: [], // Empty array
            },
        },
    };

    renderWithContext(<Component/>, state);

    expect(screen.getByText(/no items found/i)).toBeInTheDocument();
});
```

### Testing Error States

```typescript
test('should handle action failure gracefully', async () => {
    const {myAction} = require('mattermost-redux/actions/my-actions');

    // Mock error response
    myAction.mockReturnValueOnce({
        type: 'ERROR',
        error: {message: 'Request failed'},
    });

    await act(async () => {
        renderWithContext(<Component/>, state);
    });

    const button = screen.getByRole('button');
    await act(async () => {
        fireEvent.click(button);
    });

    await waitFor(() => {
        expect(myAction).toHaveBeenCalled();
    });

    // Component should not crash
    expect(screen.getByTestId('component-root')).toBeInTheDocument();
});
```

### Testing Accessibility

```typescript
describe('accessibility', () => {
    test('should have proper ARIA labels', () => {
        renderWithContext(<Component/>, state);

        const searchInput = screen.getByTestId('search-input');
        expect(searchInput).toHaveAttribute('aria-label', 'Search messages');
    });

    test('should have heading with proper id', () => {
        renderWithContext(<Component/>, state);

        const heading = screen.getByRole('heading', {name: 'Title'});
        expect(heading).toHaveAttribute('id', 'panelTitle');
    });
});
```

---

## Performance Considerations

### Speed Targets

- Single test file: < 15 seconds
- Individual test: < 500ms (aim for < 100ms)
- Test suite total: < 30 seconds

### Keep Test Data Small

```typescript
// ✅ CORRECT - Reasonable data size
const posts = Array.from({length: 20}, (_, i) =>
    TestHelper.getPostMock({id: `post${i}`})
);

// ❌ INCORRECT - Unnecessarily large dataset
const posts = Array.from({length: 1000}, (_, i) =>
    TestHelper.getPostMock({id: `post${i}`})
);
```

### Avoid Unnecessary Async Operations

```typescript
// ✅ CORRECT - No async needed for simple rendering
test('should display title', () => {
    renderWithContext(<Component/>, state);
    expect(screen.getByText('Title')).toBeInTheDocument();
});

// ❌ INCORRECT - Unnecessary async overhead
test('should display title', async () => {
    await act(async () => {
        renderWithContext(<Component/>, state);
    });
    await waitFor(() => {
        expect(screen.getByText('Title')).toBeInTheDocument();
    });
});
```

### Use Fake Timers Efficiently

```typescript
test('should debounce input', async () => {
    jest.useFakeTimers();

    // ... test logic

    act(() => {
        jest.advanceTimersByTime(100); // Advance only what's needed
    });

    // Don't use jest.runAllTimers() - it can be slow

    jest.useRealTimers();
});
```

---

## Debugging Tests

### When Tests Fail

1. **Check the error message carefully** - React Testing Library provides detailed error messages

2. **Use `screen.debug()`** to see what's actually rendered:
   ```typescript
   test('debugging test', () => {
       renderWithContext(<Component/>, state);
       screen.debug(); // Prints entire DOM
       screen.debug(screen.getByTestId('specific-element')); // Prints specific element
   });
   ```

3. **Check timer cleanup**:
   ```typescript
   afterEach(() => {
       expect(jest.getTimerCount()).toBe(0); // Verify no leaked timers
   });
   ```

4. **Verify mock calls**:
   ```typescript
   console.log(mockFunction.mock.calls); // See all calls
   expect(mockFunction).toHaveBeenCalledTimes(1);
   expect(mockFunction).toHaveBeenCalledWith('expected-arg');
   ```

### Common Issues and Solutions

#### Issue: "Unable to find element"

```typescript
// Solution: Use waitFor() for async content
await waitFor(() => {
    expect(screen.getByText('Async Content')).toBeInTheDocument();
});

// Or query* instead of get* to check if element exists
expect(screen.queryByText('Maybe Not Here')).not.toBeInTheDocument();
```

#### Issue: "act() warnings"

```typescript
// Solution: Wrap render and state updates in act()
await act(async () => {
    renderWithContext(<Component/>, state);
});

await waitFor(() => {
    expect(screen.getByText('Content')).toBeInTheDocument();
});
```

#### Issue: "Test timeout"

```typescript
// Solution: Increase timeout for slow operations
await waitFor(() => {
    expect(screen.getByText('Content')).toBeInTheDocument();
}, {timeout: 5000}); // Increase from default 1000ms
```

#### Issue: "Mock not working"

```typescript
// Solution: Ensure mock is defined before imports
jest.mock('module-path', () => ({
    myFunction: jest.fn(),
}));

// Then in test:
const {myFunction} = require('module-path');
myFunction.mockReturnValue('value');
```

---

## Checklist for New Tests

Before submitting tests, verify:

- [ ] All async tests use `act()` and `waitFor()` appropriately
- [ ] No React `act()` warnings in console output
- [ ] Tests complete in < 15 seconds
- [ ] All mocks are cleaned up in `afterEach()`
- [ ] Fake timers are restored with `jest.useRealTimers()`
- [ ] Test names clearly describe what is being tested
- [ ] Tests are organized in logical `describe()` blocks
- [ ] Tests use `TestHelper` for mock data
- [ ] TypeScript types are used for state objects
- [ ] Tests verify both success and error cases
- [ ] Accessibility requirements are tested
- [ ] No unnecessary state or data in tests

---

## Examples

For complete examples, see:
- `webapp/channels/src/components/flagged_posts_container/flagged_posts_container.test.tsx` - Full integration test with async operations
- `webapp/channels/src/components/post_view/post_list/post_list.test.tsx` - Pagination testing patterns
- `webapp/channels/src/packages/mattermost-redux/src/utils/data_loader.test.ts` - Debounce testing with fake timers

---

## Additional Resources

- [React Testing Library Documentation](https://testing-library.com/docs/react-testing-library/intro/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library Common Mistakes](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Mattermost Testing Utils](../tests/react_testing_utils.tsx)
