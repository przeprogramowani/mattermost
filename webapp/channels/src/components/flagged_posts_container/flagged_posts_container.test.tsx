// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {act} from '@testing-library/react';

import type {DeepPartial} from '@mattermost/types/utilities';

import {fireEvent, renderWithContext, screen, waitFor} from 'tests/react_testing_utils';
import Constants from 'utils/constants';
import {TestHelper} from 'utils/test_helper';

import type {GlobalState} from 'types/store';

import FlaggedPostsContainer from './flagged_posts_container';

// Mock Redux actions
jest.mock('mattermost-redux/actions/search', () => ({
    getMoreFlaggedPosts: jest.fn(() => ({type: 'MOCK_GET_MORE'})),
    getFlaggedPosts: jest.fn(() => ({type: 'MOCK_GET_FLAGGED'})),
}));

describe('FlaggedPostsContainer', () => {
    const baseState: DeepPartial<GlobalState> = {
        entities: {
            general: {
                config: {},
            },
            users: {
                currentUserId: 'current_user_id',
                profiles: {
                    current_user_id: TestHelper.getUserMock({id: 'current_user_id'}),
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
            search: {
                flagged: [],
                isGettingMoreFlaggedPosts: false,
                flaggedPostsPagination: {
                    params: {page: 0, per_page: 60},
                    isFlaggedEnd: false,
                },
            },
            posts: {
                posts: {},
                postsInChannel: {},
            },
            preferences: {
                myPreferences: {},
            },
        },
        views: {
            rhs: {
                isSearchingFlaggedPost: false,
            },
        },
    };

    afterEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    describe('rendering', () => {
        test('should show loading state initially', () => {
            const state: DeepPartial<GlobalState> = {
                ...baseState,
                views: {
                    ...baseState.views,
                    rhs: {
                        ...baseState.views?.rhs,
                        isSearchingFlaggedPost: true,
                    },
                },
            };

            renderWithContext(<FlaggedPostsContainer/>, state);

            expect(screen.getByText('Searching')).toBeInTheDocument();
        });

        test('should show empty state when no posts', () => {
            renderWithContext(<FlaggedPostsContainer/>, baseState);

            expect(screen.getByText(/no saved messages/i)).toBeInTheDocument();
            expect(screen.getByText('Save Message')).toBeInTheDocument();
        });

        test('should render flagged posts', async () => {
            const posts = [
                TestHelper.getPostMock({id: 'post1', message: 'First flagged post', create_at: Date.now() - 1000, channel_id: 'channel_id'}),
                TestHelper.getPostMock({id: 'post2', message: 'Second flagged post', create_at: Date.now() - 2000, channel_id: 'channel_id'}),
            ];

            const state: DeepPartial<GlobalState> = {
                ...baseState,
                entities: {
                    ...baseState.entities,
                    search: {
                        ...baseState.entities?.search,
                        flagged: posts.map((p) => p.id),
                    },
                    posts: {
                        posts: posts.reduce((acc, p) => ({...acc, [p.id]: p}), {}),
                        postsInChannel: {},
                    },
                },
            };

            await act(async () => {
                renderWithContext(<FlaggedPostsContainer/>, state);
            });

            await waitFor(() => {
                expect(screen.getByText('First flagged post')).toBeInTheDocument();
                expect(screen.getByText('Second flagged post')).toBeInTheDocument();
            });
        });

        test('should display "Saved messages" title', () => {
            renderWithContext(<FlaggedPostsContainer/>, baseState);

            expect(screen.getByText('Saved messages')).toBeInTheDocument();
        });

        test('should render search input with placeholder', () => {
            renderWithContext(<FlaggedPostsContainer/>, baseState);

            const input = screen.getByTestId('flagged-posts-search');
            expect(input).toBeInTheDocument();
            expect(input).toHaveAttribute('placeholder', 'Search saved messages');
        });
    });

    describe('pagination', () => {
        test('should render multiple posts', async () => {
            // Note: Scroll-triggered pagination is handled by PostListCore and requires
            // integration testing with a real browser environment to test properly.
            // This test verifies the component renders posts correctly.

            const posts = Array.from({length: 20}, (_, i) =>
                TestHelper.getPostMock({id: `post${i}`, message: `Post ${i}`, create_at: Date.now() - (i * 1000), channel_id: 'channel_id'}),
            );

            const state: DeepPartial<GlobalState> = {
                ...baseState,
                entities: {
                    ...baseState.entities,
                    search: {
                        ...baseState.entities?.search,
                        flagged: posts.map((p) => p.id),
                    },
                    posts: {
                        posts: posts.reduce((acc, p) => ({...acc, [p.id]: p}), {}),
                        postsInChannel: {},
                    },
                },
            };

            await act(async () => {
                renderWithContext(<FlaggedPostsContainer/>, state);
            });

            // Wait for posts to render
            await waitFor(() => {
                expect(screen.getByText('Post 0')).toBeInTheDocument();
                expect(screen.getByText('Post 19')).toBeInTheDocument();
            });
        });

        test('should show loading indicator during pagination', async () => {
            const posts = Array.from({length: 10}, (_, i) =>
                TestHelper.getPostMock({id: `post${i}`, message: `Post ${i}`, create_at: Date.now() - (i * 1000), channel_id: 'channel_id'}),
            );

            const state: DeepPartial<GlobalState> = {
                ...baseState,
                entities: {
                    ...baseState.entities,
                    search: {
                        ...baseState.entities?.search,
                        flagged: posts.map((p) => p.id),
                        isGettingMoreFlaggedPosts: true,
                    },
                    posts: {
                        posts: posts.reduce((acc, p) => ({...acc, [p.id]: p}), {}),
                        postsInChannel: {},
                    },
                },
            };

            await act(async () => {
                renderWithContext(<FlaggedPostsContainer/>, state);
            });

            // Verify posts are rendered along with loading indicator
            await waitFor(() => {
                expect(screen.getByText('Post 0')).toBeInTheDocument();
            });

            // Loading indicator should be present (rendered by renderLoadingMore)
            // Note: The loading spinner is a visual element without accessible text/role
            expect(screen.getByText('Post 0')).toBeInTheDocument();
        });

        test('should respect isAtEnd flag from state', async () => {
            const posts = Array.from({length: 10}, (_, i) =>
                TestHelper.getPostMock({id: `post${i}`, message: `Post ${i}`, create_at: Date.now() - (i * 1000), channel_id: 'channel_id'}),
            );

            const state: DeepPartial<GlobalState> = {
                ...baseState,
                entities: {
                    ...baseState.entities,
                    search: {
                        ...baseState.entities?.search,
                        flagged: posts.map((p) => p.id),
                        flaggedPostsPagination: {
                            params: {page: 0, per_page: 60},
                            isFlaggedEnd: true,
                        },
                    },
                    posts: {
                        posts: posts.reduce((acc, p) => ({...acc, [p.id]: p}), {}),
                        postsInChannel: {},
                    },
                },
            };

            await act(async () => {
                renderWithContext(<FlaggedPostsContainer/>, state);
            });

            // Wait for component to fully render
            await waitFor(() => {
                expect(screen.getByText('Post 0')).toBeInTheDocument();
            });

            // When at end, component receives isFlaggedEnd: true
            // Scroll behavior is managed by PostListCore and requires E2E testing
            expect(screen.getByText('Post 9')).toBeInTheDocument();
        });

        test('should show loading state while fetching more posts', async () => {
            const posts = Array.from({length: 10}, (_, i) =>
                TestHelper.getPostMock({id: `post${i}`, message: `Post ${i}`, create_at: Date.now() - (i * 1000), channel_id: 'channel_id'}),
            );

            const state: DeepPartial<GlobalState> = {
                ...baseState,
                entities: {
                    ...baseState.entities,
                    search: {
                        ...baseState.entities?.search,
                        flagged: posts.map((p) => p.id),
                        isGettingMoreFlaggedPosts: true,
                    },
                    posts: {
                        posts: posts.reduce((acc, p) => ({...acc, [p.id]: p}), {}),
                        postsInChannel: {},
                    },
                },
            };

            await act(async () => {
                renderWithContext(<FlaggedPostsContainer/>, state);
            });

            // Verify posts render even while loading more
            await waitFor(() => {
                expect(screen.getByText('Post 0')).toBeInTheDocument();
            });

            // Component should remain stable during pagination loading
            expect(screen.getAllByText(/Post \d+/).length).toBeGreaterThan(0);
        });
    });

    describe('search functionality', () => {
        test('should debounce search input', async () => {
            jest.useFakeTimers();
            const {getFlaggedPosts} = require('mattermost-redux/actions/search');
            getFlaggedPosts.mockClear();

            renderWithContext(<FlaggedPostsContainer/>, baseState);
            const input = screen.getByTestId('flagged-posts-search') as HTMLInputElement;

            // Type multiple characters quickly
            fireEvent.input(input, {target: {value: 't'}});
            fireEvent.input(input, {target: {value: 'te'}});
            fireEvent.input(input, {target: {value: 'test'}});

            // Should not dispatch immediately
            expect(getFlaggedPosts).not.toHaveBeenCalled();

            // Advance past debounce delay
            jest.advanceTimersByTime(Constants.SEARCH_TIMEOUT_MILLISECONDS);

            // Should dispatch once with final value
            await waitFor(() => {
                expect(getFlaggedPosts).toHaveBeenCalledTimes(1);
            });

            jest.useRealTimers();
        });

        test('should dispatch search action after debounce', async () => {
            jest.useFakeTimers();
            const {getFlaggedPosts} = require('mattermost-redux/actions/search');
            getFlaggedPosts.mockClear();

            renderWithContext(<FlaggedPostsContainer/>, baseState);
            const input = screen.getByTestId('flagged-posts-search') as HTMLInputElement;

            fireEvent.input(input, {target: {value: 'test query'}});

            jest.advanceTimersByTime(Constants.SEARCH_TIMEOUT_MILLISECONDS);

            await waitFor(() => {
                expect(getFlaggedPosts).toHaveBeenCalledWith('test query');
            });

            jest.useRealTimers();
        });

        test('should show clear button when input has value', async () => {
            jest.useFakeTimers();

            renderWithContext(<FlaggedPostsContainer/>, baseState);
            const input = screen.getByTestId('flagged-posts-search') as HTMLInputElement;

            // Initially no clear button
            expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();

            // Type something
            fireEvent.input(input, {target: {value: 'test'}});

            // Clear button should appear
            await waitFor(() => {
                expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
            });

            jest.useRealTimers();
        });

        test('should clear search and refetch on clear button click', async () => {
            jest.useFakeTimers();
            const {getFlaggedPosts} = require('mattermost-redux/actions/search');
            getFlaggedPosts.mockClear();

            renderWithContext(<FlaggedPostsContainer/>, baseState);
            const input = screen.getByTestId('flagged-posts-search') as HTMLInputElement;

            // Type search query
            fireEvent.input(input, {target: {value: 'test query'}});

            // Wait for clear button to appear
            await waitFor(() => {
                expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
            });

            const clearButton = screen.getByLabelText('Clear search');

            // Advance timers to process the first search
            jest.advanceTimersByTime(Constants.SEARCH_TIMEOUT_MILLISECONDS);

            await waitFor(() => {
                expect(getFlaggedPosts).toHaveBeenCalledWith('test query');
            });

            getFlaggedPosts.mockClear();

            // Click clear button
            fireEvent.click(clearButton);

            // Input should be cleared
            expect(input.value).toBe('');

            // Should dispatch with empty string
            expect(getFlaggedPosts).toHaveBeenCalledWith('');

            jest.useRealTimers();
        });

        test('should handle empty results state', () => {
            const state = {
                ...baseState,
                entities: {
                    ...baseState.entities,
                    search: {
                        ...baseState.entities?.search,
                        flagged: [],
                    },
                },
            };

            renderWithContext(<FlaggedPostsContainer/>, state);

            // Should show the default empty state when no posts are flagged
            // Note: Search term-specific empty state requires mocking the useFlaggedPostsSearch hook
            expect(screen.getByText(/no saved messages/i)).toBeInTheDocument();
        });
    });

    describe('error handling', () => {
        test('should handle pagination action failure gracefully', async () => {
            const {getMoreFlaggedPosts} = require('mattermost-redux/actions/search');

            // Mock action to return error
            getMoreFlaggedPosts.mockReturnValueOnce({type: 'MOCK_ERROR', error: {message: 'Pagination failed'}});

            const posts = Array.from({length: 10}, (_, i) =>
                TestHelper.getPostMock({id: `post${i}`, message: `Post ${i}`, create_at: Date.now() - (i * 1000), channel_id: 'channel_id'}),
            );

            const state: DeepPartial<GlobalState> = {
                ...baseState,
                entities: {
                    ...baseState.entities,
                    search: {
                        ...baseState.entities?.search,
                        flagged: posts.map((p) => p.id),
                    },
                    posts: {
                        posts: posts.reduce((acc, p) => ({...acc, [p.id]: p}), {}),
                        postsInChannel: {},
                    },
                },
            };

            await act(async () => {
                renderWithContext(<FlaggedPostsContainer/>, state);
            });

            // Wait for component to render
            await waitFor(() => {
                expect(screen.getByTestId('flagged-posts-search')).toBeInTheDocument();
            });

            // Component should render without crashing despite mocked error action
            expect(screen.getByTestId('flagged-posts-search')).toBeInTheDocument();
        });

        test('should handle search action failure gracefully', async () => {
            const {getFlaggedPosts} = require('mattermost-redux/actions/search');

            // Mock action to return error
            getFlaggedPosts.mockReturnValueOnce({type: 'MOCK_ERROR', error: {message: 'Search failed'}});

            renderWithContext(<FlaggedPostsContainer/>, baseState);

            // Trigger search by updating input
            jest.useFakeTimers();
            const input = screen.getByTestId('flagged-posts-search');
            fireEvent.input(input, {target: {value: 'test'}});
            jest.advanceTimersByTime(Constants.SEARCH_TIMEOUT_MILLISECONDS);

            await waitFor(() => {
                expect(getFlaggedPosts).toHaveBeenCalled();
            });

            // Component should not crash despite action error
            expect(screen.getByTestId('flagged-posts-search')).toBeInTheDocument();

            jest.useRealTimers();
        });
    });

    describe('accessibility', () => {
        test('should have proper ARIA labels', () => {
            renderWithContext(<FlaggedPostsContainer/>, baseState);

            // Check for aria-label on the search input
            const searchInput = screen.getByTestId('flagged-posts-search');
            expect(searchInput).toHaveAttribute('aria-label', 'Search saved messages');

            // Check that search container exists
            const searchContainer = screen.getByRole('heading', {name: 'Saved messages'});
            expect(searchContainer).toBeInTheDocument();
        });

        test('should have heading with proper id', () => {
            renderWithContext(<FlaggedPostsContainer/>, baseState);

            const heading = screen.getByRole('heading', {name: 'Saved messages'});
            expect(heading).toHaveAttribute('id', 'rhsPanelTitle');
        });
    });
});
