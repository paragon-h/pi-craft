# Testing Anti-Patterns

**Load this reference when:** writing or changing tests, adding mocks, or tempted to add test-only methods to production code.

## Overview

Tests must verify real behavior, not mock behavior. Mocks are a means to isolate, not the thing being tested.

**Core principle:** Test what the code does, not what the mocks do.

**Following strict TDD prevents these anti-patterns.**

## The Iron Laws

```
1. NEVER test mock behavior
2. NEVER add test-only methods to production classes
3. NEVER mock without understanding dependencies
```

## Anti-Pattern 1: Testing Mock Behavior

**The violation:**
```python
# ❌ BAD: Testing that the mock exists
def test_renders_sidebar():
    render(Page())
    assert screen.get_by_test_id('sidebar-mock') is not None
```

**Why this is wrong:**
- You're verifying the mock works, not that the component works
- Test passes when mock is present, fails when it's not
- Tells you nothing about real behavior

**The fix:**
```python
# ✅ GOOD: Test real component or don't mock it
def test_renders_sidebar():
    render(Page())  # Don't mock sidebar
    assert screen.get_by_role('navigation') is not None
```

### Gate Function

Before asserting on any mock element:
- Ask: "Am I testing real component behavior or just mock existence?"
- If testing mock existence: STOP. Delete the assertion or unmock the component.
- Test real behavior instead.

## Anti-Pattern 2: Test-Only Methods in Production

**The violation:**
```python
# ❌ BAD: destroy() only used in tests
class Session:
    async def destroy(self):  # Looks like production API!
        await self._workspace_manager.destroy_workspace(self.id)
        # ... cleanup

# In tests
def teardown():
    session.destroy()
```

**Why this is wrong:**
- Production class polluted with test-only code
- Dangerous if accidentally called in production
- Violates YAGNI and separation of concerns

**The fix:**
```python
# ✅ GOOD: Test utilities handle test cleanup
# test_utils.py
async def cleanup_session(session):
    workspace = session.get_workspace_info()
    if workspace:
        await workspace_manager.destroy_workspace(workspace.id)

# In tests
def teardown():
    cleanup_session(session)
```

## Anti-Pattern 3: Mocking Without Understanding

**The violation:**
```python
# ❌ BAD: Mock prevents config write that test depends on!
with patch('ToolCatalog.discover_and_cache_tools', return_value=None):
    add_server(config)
    add_server(config)  # Should throw - but won't!
```

**Why this is wrong:**
- Mocked method had side effect test depended on (writing config)
- Over-mocking to "be safe" breaks actual behavior

**The fix:**
```python
# ✅ GOOD: Mock at correct level
with patch('MCPServerManager'):  # Just mock slow server startup
    add_server(config)  # Config written
    add_server(config)  # Duplicate detected ✓
```

### Gate Function

Before mocking any method:
1. Ask: "What side effects does the real method have?"
2. Ask: "Does this test depend on any of those side effects?"
3. Ask: "Do I fully understand what this test needs?"

If unsure: Run test with real implementation FIRST. Observe what actually needs to happen. THEN add minimal mocking at the right level.

## Anti-Pattern 4: Incomplete Mocks

**The violation:**
```python
# ❌ BAD: Partial mock - only fields you think you need
mock_response = {
    'status': 'success',
    'data': {'user_id': '123', 'name': 'Alice'}
    # Missing: metadata that downstream code uses
}
```

**Why this is wrong:**
- Partial mocks hide structural assumptions
- Downstream code may depend on fields you didn't include
- Tests pass but integration fails

**The Iron Rule:** Mock the COMPLETE data structure as it exists in reality, not just fields your immediate test uses.

**The fix:**
```python
# ✅ GOOD: Mirror real API completeness
mock_response = {
    'status': 'success',
    'data': {'user_id': '123', 'name': 'Alice'},
    'metadata': {'request_id': 'req-789', 'timestamp': 1234567890}
}
```

## Anti-Pattern 5: Integration Tests as Afterthought

**The violation:**
```
✅ Implementation complete
❌ No tests written
"Ready for testing"
```

**The fix:** TDD cycle — write failing test, implement to pass, refactor, THEN claim complete.

## When Mocks Become Too Complex

**Warning signs:**
- Mock setup longer than test logic
- Mocking everything to make test pass
- Mocks missing methods real components have
- Test breaks when mock changes

**Consider:** Integration tests with real components often simpler than complex mocks.

## TDD Prevents These Anti-Patterns

**Why TDD helps:**
1. Write test first → Forces you to think about what you're actually testing
2. Watch it fail → Confirms test tests real behavior, not mocks
3. Minimal implementation → No test-only methods creep in
4. Real dependencies → You see what the test actually needs before mocking

If you're testing mock behavior, you violated TDD — you added mocks without watching test fail against real code first.

## Quick Reference

| Anti-Pattern | Fix |
|--------------|-----|
| Assert on mock elements | Test real component or unmock it |
| Test-only methods in production | Move to test utilities |
| Mock without understanding | Understand dependencies first, mock minimally |
| Incomplete mocks | Mirror real API completely |
| Tests as afterthought | TDD — tests first |
| Over-complex mocks | Consider integration tests |

## Red Flags

- Assertion checks for `*-mock` test IDs
- Methods only called in test files
- Mock setup is >50% of test
- Test fails when you remove mock
- Can't explain why mock is needed
- Mocking "just to be safe"

## The Bottom Line

Mocks are tools to isolate, not things to test.

If TDD reveals you're testing mock behavior, you've gone wrong.

Fix: Test real behavior or question why you're mocking at all.
