// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {act} from '@testing-library/react';

import type {DeepPartial} from '@mattermost/types/utilities';

import {renderWithContext, screen, waitFor} from 'tests/react_testing_utils';
import {TestHelper} from 'utils/test_helper';

import type {GlobalState} from 'types/store';

import PinnedPostsContainer from './pinned_posts_container';

describe('PinnedPostsContainer', () => {
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
                    channel_id: TestHelper.getChannelMock({id: 'channel_id', display_name: 'Test Channel'}),
                },
            },
            search: {
                pinned: {
                    channel_id: [],
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
                isSearchingPinnedPost: false,
            },
        },
    };

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('rendering', () => {
        test('should show loading state initially', () => {
            const state: DeepPartial<GlobalState> = {
                ...baseState,
                views: {
                    ...baseState.views,
                    rhs: {
                        ...baseState.views?.rhs,
                        isSearchingPinnedPost: true,
                    },
                },
            };

            renderWithContext(<PinnedPostsContainer/>, state);

            expect(screen.getByText('Searching')).toBeInTheDocument();
        });

        test('should show empty state when no pinned posts', () => {
            renderWithContext(<PinnedPostsContainer/>, baseState);

            expect(screen.getByText(/no pinned messages/i)).toBeInTheDocument();
            expect(screen.getByText('Pin to Channel')).toBeInTheDocument();
        });

        test('should render pinned posts', async () => {
            const posts = [
                TestHelper.getPostMock({
                    id: 'post1',
                    message: 'First pinned post',
                    channel_id: 'channel_id',
                    is_pinned: true,
                }),
                TestHelper.getPostMock({
                    id: 'post2',
                    message: 'Second pinned post',
                    channel_id: 'channel_id',
                    is_pinned: true,
                }),
            ];

            const state: DeepPartial<GlobalState> = {
                ...baseState,
                entities: {
                    ...baseState.entities,
                    search: {
                        pinned: {
                            channel_id: ['post1', 'post2'],
                        },
                    },
                    posts: {
                        posts: {
                            post1: posts[0],
                            post2: posts[1],
                        },
                        postsInChannel: {},
                    },
                },
            };

            await act(async () => {
                renderWithContext(<PinnedPostsContainer/>, state);
            });

            await waitFor(() => {
                expect(screen.getByText('First pinned post')).toBeInTheDocument();
                expect(screen.getByText('Second pinned post')).toBeInTheDocument();
            });
        });

        test('should display "Pinned messages" title', () => {
            renderWithContext(<PinnedPostsContainer/>, baseState);

            expect(screen.getByText('Pinned messages')).toBeInTheDocument();
        });

        test('should display channel name in header', () => {
            renderWithContext(<PinnedPostsContainer/>, baseState);

            expect(screen.getByText('Test Channel')).toBeInTheDocument();
        });

        test('should handle missing channel gracefully', () => {
            const state: DeepPartial<GlobalState> = {
                ...baseState,
                entities: {
                    ...baseState.entities,
                    channels: {
                        currentChannelId: 'nonexistent_channel',
                        channels: {
                            channel_id: TestHelper.getChannelMock({id: 'channel_id'}),
                        },
                    },
                },
            };

            // Should not crash
            renderWithContext(<PinnedPostsContainer/>, state);

            // Should still show title
            expect(screen.getByText('Pinned messages')).toBeInTheDocument();

            // Should not show channel name
            expect(screen.queryByText('Test Channel')).not.toBeInTheDocument();
        });
    });

    describe('channel-specific behavior', () => {
        test('should show posts only for current channel', async () => {
            const channel1Posts = [
                TestHelper.getPostMock({
                    id: 'post1',
                    message: 'Channel 1 pinned post 1',
                    channel_id: 'channel1',
                    is_pinned: true,
                }),
                TestHelper.getPostMock({
                    id: 'post2',
                    message: 'Channel 1 pinned post 2',
                    channel_id: 'channel1',
                    is_pinned: true,
                }),
            ];
            const channel2Posts = [
                TestHelper.getPostMock({
                    id: 'post3',
                    message: 'Channel 2 pinned post',
                    channel_id: 'channel2',
                    is_pinned: true,
                }),
            ];

            const state: DeepPartial<GlobalState> = {
                ...baseState,
                entities: {
                    ...baseState.entities,
                    channels: {
                        currentChannelId: 'channel1',
                        channels: {
                            channel1: TestHelper.getChannelMock({id: 'channel1', display_name: 'Channel 1'}),
                            channel2: TestHelper.getChannelMock({id: 'channel2', display_name: 'Channel 2'}),
                        },
                    },
                    search: {
                        pinned: {
                            channel1: ['post1', 'post2'],
                            channel2: ['post3'],
                        },
                    },
                    posts: {
                        posts: {
                            post1: channel1Posts[0],
                            post2: channel1Posts[1],
                            post3: channel2Posts[0],
                        },
                        postsInChannel: {},
                    },
                },
            };

            await act(async () => {
                renderWithContext(<PinnedPostsContainer/>, state);
            });

            await waitFor(() => {
                // Should show channel1 posts
                expect(screen.getByText('Channel 1 pinned post 1')).toBeInTheDocument();
                expect(screen.getByText('Channel 1 pinned post 2')).toBeInTheDocument();

                // Should NOT show channel2 posts
                expect(screen.queryByText('Channel 2 pinned post')).not.toBeInTheDocument();
            });
        });

        test('should update when switching channels', async () => {
            const posts = [
                TestHelper.getPostMock({
                    id: 'post1',
                    message: 'Channel 1 post',
                    channel_id: 'channel1',
                    is_pinned: true,
                }),
                TestHelper.getPostMock({
                    id: 'post2',
                    message: 'Channel 2 post',
                    channel_id: 'channel2',
                    is_pinned: true,
                }),
            ];

            const initialState: DeepPartial<GlobalState> = {
                ...baseState,
                entities: {
                    ...baseState.entities,
                    channels: {
                        currentChannelId: 'channel1',
                        channels: {
                            channel1: TestHelper.getChannelMock({id: 'channel1', display_name: 'Channel 1'}),
                            channel2: TestHelper.getChannelMock({id: 'channel2', display_name: 'Channel 2'}),
                        },
                    },
                    search: {
                        pinned: {
                            channel1: ['post1'],
                            channel2: ['post2'],
                        },
                    },
                    posts: {
                        posts: {
                            post1: posts[0],
                            post2: posts[1],
                        },
                        postsInChannel: {},
                    },
                },
            };

            const {replaceStoreState} = await act(async () => {
                return renderWithContext(<PinnedPostsContainer/>, initialState);
            });

            await waitFor(() => {
                expect(screen.getByText('Channel 1 post')).toBeInTheDocument();
                expect(screen.getByText('Channel 1')).toBeInTheDocument();
            });

            // Switch to channel2
            const updatedState: DeepPartial<GlobalState> = {
                ...initialState,
                entities: {
                    ...initialState.entities,
                    channels: {
                        ...initialState.entities?.channels,
                        currentChannelId: 'channel2',
                    },
                },
            };

            await act(async () => {
                replaceStoreState(updatedState);
            });

            await waitFor(() => {
                expect(screen.getByText('Channel 2 post')).toBeInTheDocument();
                expect(screen.getByText('Channel 2')).toBeInTheDocument();
                expect(screen.queryByText('Channel 1 post')).not.toBeInTheDocument();
            });
        });
    });

    describe('error handling', () => {
        test('should handle missing posts gracefully', async () => {
            const state: DeepPartial<GlobalState> = {
                ...baseState,
                entities: {
                    ...baseState.entities,
                    search: {
                        pinned: {
                            channel_id: ['post1', 'post2', 'post3'], // IDs exist in search
                        },
                    },
                    posts: {
                        posts: {
                            post1: TestHelper.getPostMock({
                                id: 'post1',
                                message: 'Existing post',
                                channel_id: 'channel_id',
                            }), // Only post1 exists in posts store
                            // post2 and post3 are missing - filtered out by selector
                        },
                        postsInChannel: {},
                    },
                },
            };

            await act(async () => {
                renderWithContext(<PinnedPostsContainer/>, state);
            });

            await waitFor(() => {
                // Component filters out missing posts and renders only existing ones
                expect(screen.getByText('Existing post')).toBeInTheDocument();
            });

            // Should not show posts that don't exist in the store
            expect(screen.queryByText('post2')).not.toBeInTheDocument();
            expect(screen.queryByText('post3')).not.toBeInTheDocument();
        });
    });

    describe('accessibility', () => {
        test('should have proper ARIA labels', async () => {
            const posts = [
                TestHelper.getPostMock({
                    id: 'post1',
                    message: 'Test post',
                    channel_id: 'channel_id',
                    is_pinned: true,
                }),
            ];

            const state: DeepPartial<GlobalState> = {
                ...baseState,
                entities: {
                    ...baseState.entities,
                    search: {
                        pinned: {
                            channel_id: ['post1'],
                        },
                    },
                    posts: {
                        posts: {
                            post1: posts[0],
                        },
                        postsInChannel: {},
                    },
                },
            };

            await act(async () => {
                renderWithContext(<PinnedPostsContainer/>, state);
            });

            await waitFor(() => {
                // The aria-label is applied to the container div when there are posts
                const container = screen.getByLabelText('Pinned messages complementary region');
                expect(container).toBeInTheDocument();
                expect(container).toHaveAttribute('id', 'search-items-container');
            });
        });

        test('should have heading with proper id', () => {
            renderWithContext(<PinnedPostsContainer/>, baseState);

            const heading = screen.getByRole('heading', {name: 'Pinned messages'});
            expect(heading).toHaveAttribute('id', 'rhsPanelTitle');
        });
    });
});
