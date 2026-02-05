# React Native Architecture & Design Best Practices
## 100-Point Comprehensive Analysis

**Focus Areas:**
- Architectural Best Practices
- Common Pitfalls & Avoidance Strategies  
- Animation Optimization
- Video Streaming Performance

---

## I. ARCHITECTURAL BEST PRACTICES

### A. Component Architecture

#### 1. Composition Over Inheritance
- Favor functional components with hooks over class components
- Build complex UIs from smaller, focused components
- Use composition patterns: render props, children, HOCs sparingly
- **Example:** Instead of extending a `BaseButton`, compose `<Pressable>` with custom children

#### 2. Component Responsibility Segregation
- **Presentational Components:** Pure UI rendering, receive props, no business logic
- **Container Components:** Data fetching, state management, business logic orchestration
- **Screen Components:** Route-level orchestration, layout structure
- **Shared Components:** Reusable across features, no feature-specific logic

#### 3. Component Size Principle
- Keep components under 200 lines
- Single Responsibility: one component, one job
- Extract complex logic into custom hooks
- Split when component handles multiple concerns

#### 4. Smart Props Design
- Use TypeScript interfaces for prop definitions
- Provide sensible defaults for optional props
- Avoid prop drilling beyond 2-3 levels (use Context or state management)
- Flatten complex props: prefer `firstName` and `lastName` over `name: {first, last}`

### B. State Management Architecture

#### 5. State Categorization Strategy
- **Server State:** API data (React Query/TanStack Query)
- **Global UI State:** Theme, user preferences (Context/Zustand)
- **Local Component State:** Form inputs, toggles (useState)
- **Navigation State:** Stack position, params (React Navigation)
- **Persistent State:** Auth tokens, offline data (MMKV/AsyncStorage)

#### 6. State Colocation Principle
- Keep state as close to where it's used as possible
- Lift state only when actually needed by multiple components
- Avoid premature global state—start local, refactor when sharing is needed

#### 7. Server State Management Best Practices
- Use React Query/TanStack Query for all API interactions
- Implement stale-while-revalidate pattern
- Configure cache times based on data volatility (bookings: 1min, course info: 1hr)
- Leverage optimistic updates for perceived performance

#### 8. Global State Minimalism
- Keep global state minimal—only truly shared data
- Avoid storing derived data (compute on-demand with useMemo)
- Use Zustand over Redux for simpler use cases
- Implement selectors to prevent unnecessary re-renders

### C. Folder Structure Architecture

#### 9. Feature-Based Organization (Recommended for medium-large apps)
```
src/
  features/
    booking/
      components/       # Feature-specific components
      screens/          # Screen components
      hooks/            # Custom hooks
      services/         # API calls, business logic
      types/            # TypeScript definitions
      utils/            # Feature utilities
      index.ts          # Public API
    lessons/
    coaching/
  shared/
    components/         # Reusable UI components
    hooks/              # Shared hooks
    services/           # Common services (auth, analytics)
    utils/              # Helper functions
    theme/              # Design tokens
    types/              # Global types
  navigation/
  config/
```

#### 10. Layer-Based Organization (Alternative for smaller apps)
```
src/
  components/
    common/
    booking/
    lessons/
  screens/
  services/
  hooks/
  utils/
  types/
  theme/
```

#### 11. Barrel Exports Strategy
- Use `index.ts` files for clean imports
- Export only public APIs from features
- Prevent deep imports: `features/booking` not `features/booking/components/internal`
- Caution: Can impact tree-shaking; use named exports

### D. Navigation Architecture

#### 12. Navigation Structure Principles
- **Stack Navigators:** For linear flows (booking process, lesson details)
- **Tab Navigators:** For main app sections (home, lessons, profile)
- **Drawer Navigators:** For secondary access (settings, help)
- **Modal Stacks:** For overlay flows (filters, payments)

#### 13. Deep Linking Configuration
- Configure universal links for all key screens
- Define URL patterns early: `app://course/:courseId/book`
- Handle fallbacks when deep link data unavailable
- Test with deferred deep links (app not installed)

#### 14. Navigation Performance
- Enable screen lazy loading
- Use `React.lazy()` for heavy screens
- Preload critical screens in idle time
- Implement navigation guards for auth checks

#### 15. Type-Safe Navigation
```typescript
type RootStackParamList = {
  Home: undefined;
  CourseDetail: { courseId: string };
  Booking: { courseId: string; date: Date };
};

// Type-safe navigation
navigation.navigate('CourseDetail', { courseId: '123' });
```

### E. Data Flow Architecture

#### 16. Unidirectional Data Flow
- Props flow down, events flow up
- Never modify props directly
- Use callbacks for child-to-parent communication
- Implement event emitters for cross-feature communication when necessary

#### 17. API Integration Architecture
- **Single API Client:** Centralized Axios instance with interceptors
- **Request/Response Transformation:** Normalize API responses to app models
- **Error Handling Layer:** Centralized error parsing and user-friendly messages
- **Retry Logic:** Exponential backoff for transient failures

#### 18. Offline-First Architecture
- Queue mutations when offline (local queue with retry)
- Sync queue on reconnection
- Show cached data with staleness indicators
- Conflict resolution strategy for concurrent modifications

### F. Dependency Management

#### 19. Dependency Injection Patterns
- Use Context for providing services (API clients, analytics)
- Constructor injection for class-based services
- Avoid circular dependencies with barrel exports
- Mock dependencies in tests through provider swapping

#### 20. Third-Party Library Selection Criteria
- Active maintenance (updated within 6 months)
- React Native compatibility score
- Bundle size impact (use bundlephobia)
- Native module requirements (increase build complexity)
- Community adoption and support

---

## II. COMMON PITFALLS & AVOIDANCE STRATEGIES

### A. Performance Pitfalls

#### 21. Pitfall: Unnecessary Re-renders
- **Cause:** Creating new objects/functions in render
- **Avoidance:** 
  - Use `useMemo` for expensive computations
  - Use `useCallback` for callback props
  - Memoize components with `React.memo`
  - Extract static objects outside component

**Example:**
```typescript
// ❌ BAD: New object every render
const MyComponent = () => {
  const style = { flex: 1, backgroundColor: 'blue' };
  return <View style={style} />;
};

// ✅ GOOD: Static or memoized
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'blue' }
});

const MyComponent = () => {
  return <View style={styles.container} />;
};
```

#### 22. Pitfall: Inline Function Creation in Lists
- **Cause:** `onPress={() => handlePress(item.id)}` in FlatList
- **Avoidance:**
  - Extract to separate component
  - Use `useCallback` with dependencies
  - Pass item data through closure

#### 23. Pitfall: Not Using Keys in Lists
- **Cause:** Missing or non-unique keys in FlatList/map
- **Avoidance:**
  - Use stable, unique IDs as keys
  - Never use array index as key for dynamic lists
  - Avoid random values or timestamps as keys

#### 24. Pitfall: Over-Using State
- **Cause:** Storing derived/computed values in state
- **Avoidance:**
  - Compute derived values during render
  - Use `useMemo` for expensive derived calculations
  - Only store minimal, irreducible state

#### 25. Pitfall: Massive Component Trees
- **Cause:** Deep nesting causing layout thrashing
- **Avoidance:**
  - Flatten component hierarchies
  - Use `flexbox` efficiently (avoid unnecessary wrappers)
  - Limit nesting to 5-7 levels maximum

### B. State Management Pitfalls

#### 26. Pitfall: State Update Race Conditions
- **Cause:** Using stale state in async operations
- **Avoidance:**
  - Use functional setState: `setState(prev => prev + 1)`
  - Use refs for values that don't trigger renders
  - Leverage useReducer for complex state logic

#### 27. Pitfall: Context Overuse
- **Cause:** Everything in Context causing global re-renders
- **Avoidance:**
  - Split contexts by concern (UserContext, ThemeContext)
  - Memoize context values
  - Use state management library for complex shared state
  - Consider composition over context

#### 28. Pitfall: Not Cleaning Up Effects
- **Cause:** Memory leaks from subscriptions, timers, listeners
- **Avoidance:**
  - Always return cleanup function from useEffect
  - Cancel API requests on unmount
  - Remove event listeners in cleanup
  - Clear timeouts/intervals

**Example:**
```typescript
useEffect(() => {
  const subscription = eventEmitter.on('booking', handleBooking);
  const timer = setTimeout(fetchData, 1000);
  
  return () => {
    subscription.remove();
    clearTimeout(timer);
  };
}, []);
```

#### 29. Pitfall: Prop Drilling Hell
- **Cause:** Passing props through 5+ intermediate components
- **Avoidance:**
  - Use Context for deeply nested data
  - Implement composition patterns
  - Consider component colocation
  - Use state management for truly global data

#### 30. Pitfall: Async State Updates
- **Cause:** Expecting immediate state after setState
- **Avoidance:**
  - Remember setState is asynchronous
  - Use useEffect to react to state changes
  - For immediate access, use the value directly, not from state

### C. Navigation Pitfalls

#### 31. Pitfall: Navigation Prop Dependency
- **Cause:** Tightly coupling components to navigation
- **Avoidance:**
  - Use `useNavigation` hook in functional components
  - Pass navigation as dependency, not through props drilling
  - Create navigation-agnostic components when possible

#### 32. Pitfall: Unmanaged Navigation State
- **Cause:** Losing navigation state on app restart
- **Avoidance:**
  - Persist navigation state for better UX
  - Configure `linking` for deep link restoration
  - Handle interrupted flows gracefully

#### 33. Pitfall: Complex Params Objects
- **Cause:** Passing large objects through navigation params
- **Avoidance:**
  - Pass IDs only, fetch full data in destination screen
  - Use global state for complex shared data
  - Limit params to primitives and small serializable objects

### D. Styling Pitfalls

#### 34. Pitfall: Inline Styles Everywhere
- **Cause:** Performance hit from new style objects every render
- **Avoidance:**
  - Use StyleSheet.create() for static styles
  - Extract dynamic styles to useMemo
  - Combine static and dynamic: `[styles.base, dynamicStyle]`

#### 35. Pitfall: Not Using Platform-Specific Styles
- **Cause:** Identical styling on iOS and Android looking wrong
- **Avoidance:**
  - Use `Platform.select()` for OS-specific styles
  - Create separate style files when substantial differences
  - Follow platform design guidelines (Material vs iOS)

**Example:**
```typescript
const styles = StyleSheet.create({
  container: {
    padding: Platform.select({
      ios: 20,
      android: 16,
    }),
  },
});
```

#### 36. Pitfall: Pixel Values Instead of Flexible Layout
- **Cause:** Fixed dimensions breaking on different screen sizes
- **Avoidance:**
  - Use flex, percentage-based layouts
  - Leverage Dimensions API for screen-relative sizing
  - Test on multiple device sizes
  - Use responsive design patterns

### E. Code Quality Pitfalls

#### 37. Pitfall: Ignoring TypeScript Errors
- **Cause:** Using `any` types, `@ts-ignore` everywhere
- **Avoidance:**
  - Proper type definitions for all props and state
  - Use `unknown` instead of `any` when type is uncertain
  - Fix type errors, don't suppress them
  - Gradually migrate JavaScript to TypeScript

#### 38. Pitfall: Missing Error Boundaries
- **Cause:** Single component crash breaking entire app
- **Avoidance:**
  - Implement error boundaries at feature level
  - Provide fallback UI for errors
  - Log errors to monitoring service (Sentry)
  - Test error scenarios

#### 39. Pitfall: Console Logs in Production
- **Cause:** Performance impact and security concerns
- **Avoidance:**
  - Use proper logging library (react-native-logs)
  - Strip console.logs in production builds
  - Implement log levels (debug, info, error)
  - Use Flipper for development debugging

#### 40. Pitfall: Hardcoded Strings
- **Cause:** No internationalization, difficult maintenance
- **Avoidance:**
  - Use i18n library (react-i18next)
  - Externalize all user-facing strings
  - Prepare for localization from day one
  - Use string constants for non-i18n system strings

### F. Native Module Pitfalls

#### 41. Pitfall: Excessive Native Modules
- **Cause:** Increased app size, build complexity, maintenance burden
- **Avoidance:**
  - Evaluate if pure JavaScript solution exists
  - Use well-maintained community modules
  - Understand auto-linking vs manual linking
  - Budget for platform-specific maintenance

#### 42. Pitfall: Ignoring Platform Differences
- **Cause:** Assuming identical behavior on iOS and Android
- **Avoidance:**
  - Test on both platforms continuously
  - Read library documentation for platform quirks
  - Handle permission models differently per platform
  - Accept some features may be platform-specific

#### 43. Pitfall: Bridge Serialization Bottlenecks
- **Cause:** Sending large data objects over bridge repeatedly
- **Avoidance:**
  - Minimize bridge crossings
  - Use JSI modules when possible (new architecture)
  - Batch operations instead of multiple small calls
  - Keep heavy processing on appropriate side of bridge

### G. Testing Pitfalls

#### 44. Pitfall: No Testing Strategy
- **Cause:** Bugs reaching production, regression issues
- **Avoidance:**
  - Unit tests for business logic (Jest)
  - Component tests (React Native Testing Library)
  - E2E tests for critical flows (Detox)
  - Aim for 70%+ coverage on business logic

#### 45. Pitfall: Testing Implementation Details
- **Cause:** Brittle tests that break on refactoring
- **Avoidance:**
  - Test user behavior, not implementation
  - Query by accessible role, text, testID
  - Avoid testing internal state directly
  - Focus on integration over unit tests for UI

---

## III. ANIMATION OPTIMIZATION

### A. Animation Fundamentals

#### 46. Choose the Right Animation Library
- **Reanimated 2/3:** High-performance, runs on UI thread, 60fps guaranteed
- **Animated API:** Simpler, good for basic animations, JS thread limitation
- **Lottie:** JSON-based animations, designer-friendly, limited interactivity
- **Use Case Match:** Reanimated for interactive, Lottie for decorative

#### 47. UI Thread vs JS Thread Strategy
- **UI Thread** (Reanimated): Gesture-driven animations, continuous interactions
- **JS Thread** (Animated): State-driven animations, one-off transitions
- **Hybrid:** Initial state change (JS), animation execution (UI thread)

#### 48. Understand Animation Performance Impact
- Animations that change layout (height, width) are expensive
- Transform and opacity changes are cheap (GPU-accelerated)
- Avoid animating: flex, padding, margin when possible
- Prefer: translateX, translateY, scale, rotate, opacity

### B. Reanimated Best Practices

#### 49. Use Shared Values Correctly
- Shared values bridge UI and JS threads
- Read shared values only in worklets
- Minimize derived shared values
- Use `.value` suffix for direct access in worklets

**Example:**
```typescript
const offset = useSharedValue(0);

// ✅ In worklet
const animatedStyle = useAnimatedStyle(() => {
  return {
    transform: [{ translateX: offset.value }],
  };
});

// ❌ In regular JS
console.log(offset.value); // Won't update reactively
```

#### 50. Leverage Worklets
- Mark functions with `'worklet'` directive for UI thread execution
- Worklets cannot access React state/props directly
- Pass values through shared values or function parameters
- Use `runOnJS()` to call JS functions from worklets

#### 51. Optimize Gesture Handlers
- Use `Gesture` API from react-native-gesture-handler
- Attach gestures directly to animated components
- Avoid state updates during active gestures
- Update shared values, derive styles with useAnimatedStyle

#### 52. Spring vs Timing Animations
- **Spring:** Natural, physics-based, auto-adjusts duration
- **Timing:** Precise control, predictable duration
- **Golf App Use:** Spring for interactive (drag), Timing for choreographed sequences

**Example:**
```typescript
// Spring for natural feel
offset.value = withSpring(targetValue, {
  damping: 15,
  stiffness: 100,
});

// Timing for precise control
offset.value = withTiming(targetValue, {
  duration: 300,
  easing: Easing.inOut(Easing.ease),
});
```

#### 53. Sequence and Parallel Animations
- Use `withSequence()` for step-by-step animations
- Use `withDelay()` for staggered effects
- Combine for complex choreography
- Avoid deeply nested animation chains

#### 54. Avoid Animation Janks
- Don't trigger layout recalculations during animation
- Use `transform` instead of position properties
- Batch multiple property changes into single animated style
- Profile with React DevTools and Flipper

### C. FlatList Animation Optimization

#### 55. Animated List Item Entry
- Use entering/exiting animations from Reanimated
- Stagger list item animations with delay
- Limit to first X visible items (don't animate 1000 items)
- Use `initialNumToRender` to prevent all mounting at once

**Example:**
```typescript
<Animated.View
  entering={FadeInDown.delay(index * 100).springify()}
  exiting={FadeOut}
>
  {/* List item content */}
</Animated.View>
```

#### 56. Scroll-Based Animations
- Use `useAnimatedScrollHandler` for scroll-driven effects
- Interpolate scroll position to animated values
- Create parallax, sticky headers, collapsible headers
- Memoize interpolation configurations

**Example:**
```typescript
const scrollY = useSharedValue(0);

const scrollHandler = useAnimatedScrollHandler({
  onScroll: (event) => {
    scrollY.value = event.contentOffset.y;
  },
});

const headerStyle = useAnimatedStyle(() => {
  return {
    opacity: interpolate(
      scrollY.value,
      [0, 100],
      [1, 0],
      Extrapolate.CLAMP
    ),
  };
});
```

#### 57. Reduce Animation Complexity in Lists
- Limit animated items to visible viewport
- Use simpler animations for off-screen items
- Disable animations during fast scrolling
- Consider static items for performance-critical lists

### D. Lottie Animations

#### 58. Lottie Performance Guidelines
- Keep JSON file size under 100KB for smooth performance
- Use vector shapes, avoid embedded images
- Limit layer count (< 30 layers for complex animations)
- Enable hardware acceleration when available

#### 59. Lottie Integration Best Practices
- Lazy load Lottie animations (don't bundle 50 animations)
- Preload critical animations during splash screen
- Cache Lottie sources for reuse
- Use `autoPlay={false}` and control programmatically

#### 60. Lottie for Golf App Use Cases
- Loading states for booking submission
- Success checkmark after payment
- Animated tutorial walkthroughs
- Decorative course weather animations

### E. Animation Testing & Debugging

#### 61. Animation Performance Profiling
- Enable Performance Monitor in dev mode
- Watch JS frame rate and UI frame rate separately
- Target: 60fps UI thread, 60fps JS thread
- Use Chrome DevTools Performance tab for CPU profiling

#### 62. Reanimated Debugging
- Use `.value` logging in worklets carefully (performance impact)
- Leverage Reanimated DevTools plugin
- Test on physical devices (simulator animations are misleading)
- Profile on low-end Android devices

#### 63. Animation A/B Testing
- Test animation duration preferences with users
- Balance delight vs efficiency (users want speed)
- Measure impact on conversion (do animations help booking?)
- Provide "reduce motion" accessibility option

---

## IV. VIDEO STREAMING OPTIMIZATION

### A. Video Player Architecture

#### 64. Choose the Right Video Library
- **react-native-video:** Most popular, feature-rich, actively maintained
- **expo-av:** Good for Expo projects, simpler API
- **react-native-video-player:** Higher-level wrapper with controls
- **Recommendation:** react-native-video for production apps

#### 65. Video Player Component Structure
- Separate player logic from UI controls
- Create reusable VideoPlayer component
- Support fullscreen mode with orientation lock
- Implement playback controls overlay

**Example Structure:**
```typescript
<VideoPlayer
  source={{ uri: lessonVideoUrl }}
  controls={true}
  onProgress={handleProgress}
  onEnd={markLessonComplete}
  resizeMode="contain"
  poster={thumbnailUrl}
/>
```

#### 66. Video State Management
- Track playback state: playing, paused, buffering, error
- Store current playback position (resume capability)
- Monitor video metadata: duration, dimensions, bitrate
- Handle player lifecycle (mount, unmount, background)

#### 67. Video Player Event Handling
- `onLoad`: Video metadata available, show controls
- `onProgress`: Update progress bar, save position for resume
- `onBuffer`: Show loading indicator
- `onError`: Display error message, retry option
- `onEnd`: Mark lesson complete, suggest next video

### B. Video Streaming Performance

#### 68. Adaptive Bitrate Streaming (ABR)
- Use HLS (HTTP Live Streaming) for iOS, Android
- Server generates multiple quality variants (480p, 720p, 1080p)
- Player automatically switches based on bandwidth
- **Critical for Golf Videos:** Users may be on course with poor connectivity

**HLS URL Example:**
```typescript
source={{ 
  uri: 'https://cdn.golf.com/lessons/swing-basics/master.m3u8',
  type: 'm3u8'
}}
```

#### 69. Video Preloading Strategy
- Preload next lesson video during current lesson
- Use `prefetch` API to warm CDN cache
- Implement predictive preloading (user behavior analysis)
- Balance: preload helps UX but wastes bandwidth if unused

#### 70. Video Buffering Optimization
- Configure buffer size appropriately (5-10 seconds ahead)
- Show buffering indicator only after 1-2 seconds
- Implement buffer-based quality switching
- Monitor buffer health, adjust quality proactively

#### 71. CDN and Edge Caching
- Use video-optimized CDN (Cloudflare Stream, AWS CloudFront)
- Enable edge caching for popular lessons
- Implement geographic-based routing
- Cache thumbnails aggressively (long TTL)

#### 72. Video Compression Settings
- **Codec:** H.264 for compatibility, H.265 for efficiency
- **Bitrate:** 1-3 Mbps for 720p, 3-6 Mbps for 1080p
- **Audio:** AAC 128kbps (overkill for coaching narration)
- **Frame Rate:** 30fps sufficient for coaching, 60fps for slow-motion swing analysis

### C. Offline Video Support

#### 73. Download for Offline Viewing
- Implement video download feature for lessons
- Use react-native-fs for file system access
- Store videos in app's document directory
- Show download progress with pause/resume capability

**Example:**
```typescript
const downloadVideo = async (url: string, lessonId: string) => {
  const downloadDest = `${RNFS.DocumentDirectoryPath}/lesson_${lessonId}.mp4`;
  
  const download = RNFS.downloadFile({
    fromUrl: url,
    toFile: downloadDest,
    progress: (res) => {
      const progress = (res.bytesWritten / res.contentLength) * 100;
      updateDownloadProgress(lessonId, progress);
    },
  });
  
  await download.promise;
  saveOfflineVideo(lessonId, downloadDest);
};
```

#### 74. Offline Video Management
- Limit total offline storage (e.g., 2GB, 10 lessons max)
- Implement LRU eviction when storage full
- Show storage usage in settings
- Allow manual deletion of offline videos

#### 75. Source Switching for Offline/Online
- Check if video exists locally before streaming
- Seamless switch between local and remote sources
- Handle edge case: partial download, corrupted file
- Sync watched progress across offline/online modes

**Example:**
```typescript
const getVideoSource = async (lessonId: string) => {
  const localPath = await getOfflineVideoPath(lessonId);
  
  if (localPath && await fileExists(localPath)) {
    return { uri: `file://${localPath}` };
  }
  
  return { uri: `https://cdn.golf.com/lessons/${lessonId}.m3u8` };
};
```

### D. Video UI/UX Optimization

#### 76. Video Thumbnail Strategy
- Generate thumbnails on server (multiple frame options)
- Load thumbnail before video (instant visual feedback)
- Use progressive image loading (blur-up technique)
- Cache thumbnails aggressively with long expiration

#### 77. Custom Video Controls
- Implement custom playback controls for brand consistency
- Add 10s forward/backward buttons (common in educational content)
- Playback speed control (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x)
- Scrubbing preview (show frame on seek bar hover)

#### 78. Picture-in-Picture (PiP) Mode
- Enable PiP for multi-tasking (user continues watching while browsing)
- iOS: Use PictureInPicture from react-native-video
- Android: Use PiP mode APIs
- Maintain playback state across PiP transitions

#### 79. Fullscreen Handling
- Lock orientation when entering fullscreen
- Hide system UI (status bar, navigation bar)
- Adjust controls layout for landscape
- Provide exit fullscreen button

#### 80. Video Analytics Tracking
- Track video starts, completions, drop-off points
- Monitor average watch percentage per lesson
- Identify buffering issues (quality of experience)
- A/B test video lengths (optimal coaching video duration)

**Metrics to Track:**
```typescript
{
  videoId: 'swing-basics-101',
  watchedDuration: 245, // seconds
  totalDuration: 300,
  completionRate: 0.82,
  bufferingEvents: 2,
  averageBitrate: '720p',
  deviceType: 'iPhone 12',
}
```

### E. Video Memory Management

#### 81. Prevent Memory Leaks
- Pause video when component unmounts
- Release video player resources properly
- Clear video cache periodically
- Handle background/foreground transitions

**Example:**
```typescript
useEffect(() => {
  return () => {
    // Cleanup on unmount
    videoRef.current?.pause();
    videoRef.current = null;
  };
}, []);

// Handle app state changes
useEffect(() => {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'background') {
      videoRef.current?.pause();
    }
  });
  
  return () => subscription.remove();
}, []);
```

#### 82. Video List Optimization
- Don't auto-play videos in FlatList
- Unload videos outside viewport
- Use thumbnail previews for lesson library
- Implement "tap to play" for in-list previews

#### 83. Multiple Video Instances
- Limit simultaneous video players (max 1-2)
- Pause other videos when new one plays
- Release resources from paused videos
- Use singleton video service for coordination

### F. Advanced Video Features

#### 84. Video Chapters/Markers
- Divide long coaching videos into chapters
- Show chapter markers on seek bar
- Enable chapter skip navigation
- Display current chapter in UI

**Example:**
```typescript
const chapters = [
  { time: 0, title: 'Introduction' },
  { time: 45, title: 'Grip Technique' },
  { time: 120, title: 'Stance Setup' },
  { time: 200, title: 'Swing Mechanics' },
];
```

#### 85. Video Annotations/Overlays
- Overlay text annotations at specific timestamps
- Highlight key swing positions with graphics
- Interactive elements (quiz questions at intervals)
- Implement using absolute positioned views synced to playback time

#### 86. Slow Motion Replay
- Provide slow motion controls for swing analysis
- Use `rate` prop on Video component (0.25x, 0.5x)
- Frame-by-frame scrubbing for detailed analysis
- Reset to normal speed automatically

#### 87. Video Quality Selection
- Allow manual quality override (auto, 480p, 720p, 1080p)
- Remember user preference
- Show data usage estimate per quality
- Auto mode as default (ABR)

#### 88. Subtitles/Closed Captions
- Support WebVTT format for subtitles
- Enable accessibility for hearing-impaired users
- Multi-language support for international users
- Toggle on/off in player controls

**Example:**
```typescript
<Video
  source={{ uri: videoUrl }}
  textTracks={[
    {
      type: 'application/x-subrip',
      language: 'en',
      uri: 'https://cdn.golf.com/subtitles/lesson-101-en.srt',
    },
  ]}
  selectedTextTrack={{ type: 'language', value: 'en' }}
/>
```

### G. Video Testing & Monitoring

#### 89. Video Playback Testing
- Test on various network conditions (WiFi, 4G, 3G, offline)
- Simulate network interruptions and recovery
- Test on low-end devices (memory constraints)
- Verify HLS stream playback on both platforms

#### 90. Video Performance Monitoring
- Track video start time (time to first frame)
- Monitor buffering frequency and duration
- Measure quality switches (ABR effectiveness)
- Alert on high error rates

**Monitoring Metrics:**
```typescript
{
  videoStartTime: 1200, // ms from tap to first frame
  bufferingTime: 3500, // total buffering in ms
  bufferingCount: 2,
  errorRate: 0.01, // 1% of playback attempts fail
  averageQuality: '720p',
  completionRate: 0.78,
}
```

#### 91. Video CDN Performance
- Monitor CDN response times by region
- Track cache hit rates (higher = better performance)
- Analyze video load distribution across edge nodes
- Set up alerts for CDN degradation

#### 92. Error Recovery Strategies
- Implement automatic retry on playback error (3 attempts)
- Fallback to lower quality on repeated failures
- Display user-friendly error messages with actions
- Log errors to monitoring service for analysis

**Error Handling:**
```typescript
const [retryCount, setRetryCount] = useState(0);

const handleVideoError = (error) => {
  if (retryCount < 3) {
    setRetryCount(prev => prev + 1);
    videoRef.current?.reload();
  } else {
    showErrorMessage('Unable to load video. Please check your connection.');
    logVideoError({ videoId, error, userAgent, network });
  }
};
```

---

## V. PERFORMANCE OPTIMIZATION CHECKLIST

#### 93. App Launch Optimization
- Minimize splash screen duration (< 2 seconds)
- Lazy load non-critical features
- Defer analytics initialization
- Use Hermes JavaScript engine (faster startup)

#### 94. Bundle Size Optimization
- Enable ProGuard (Android) and bitcode (iOS)
- Remove unused dependencies regularly
- Code splitting for large features
- Analyze bundle with `react-native-bundle-visualizer`

#### 95. Image Optimization
- Use WebP format (smaller than PNG/JPG)
- Implement progressive image loading
- Cache images with react-native-fast-image
- Generate multiple resolutions for different densities

#### 96. List Performance (FlatList)
- Set appropriate `initialNumToRender` (10-15)
- Implement `getItemLayout` for fixed height items
- Use `removeClippedSubviews` on Android
- Enable `maxToRenderPerBatch` and `windowSize` tuning

#### 97. Memory Management
- Profile with Xcode Instruments and Android Profiler
- Fix memory leaks (subscriptions, timers, listeners)
- Limit concurrent heavy operations
- Implement pagination for large data sets

#### 98. Network Optimization
- Batch API requests when possible
- Implement request deduplication
- Use HTTP/2 for multiplexing
- Compress request/response payloads (gzip)

#### 99. Build Optimization
- Enable caching in CI/CD (Gradle, CocoaPods)
- Use Fastlane for automated builds
- Implement incremental builds
- Parallelize build steps

#### 100. Continuous Performance Monitoring
- Set up performance budgets (app size, load time, FPS)
- Automated performance testing in CI
- Real user monitoring (RUM) in production
- Regular performance audits and optimization sprints

---

## CONCLUSION

React Native architecture excellence requires balancing multiple concerns: clean code organization, optimal performance, smooth animations, and reliable video streaming. The 100 points outlined above provide a comprehensive framework for building production-grade mobile applications.

**Key Takeaways:**

- **Architecture:** Feature-based organization, clear separation of concerns, typed interfaces
- **Pitfall Avoidance:** Memoization, proper cleanup, platform awareness, testing strategy
- **Animations:** Reanimated for performance, UI thread execution, transform over layout
- **Video:** ABR streaming, offline support, memory management, comprehensive analytics

Success in React Native development comes from understanding these principles deeply and applying them consistently throughout your codebase. Regular code reviews, performance profiling, and user feedback loops ensure your architecture remains robust as your golf platform scales.

---

**Document Version:** 1.0  
**Last Updated:** February 2026  
**Target Audience:** Lead Architects, Senior Mobile Developers, Technical Decision Makers
