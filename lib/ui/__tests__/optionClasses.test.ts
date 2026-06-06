import {
  getOptionButtonClass,
  getOptionCardClass,
  getOptionInlineBadgeClass,
  getOptionSelectedBadgeClass,
} from '../optionClasses';

describe('optionClasses', () => {
  test('getOptionButtonClass applies selected and unselected classes', () => {
    expect(getOptionButtonClass(true)).toContain('pod-option-button-selected');
    expect(getOptionButtonClass(false)).toContain('pod-option-button-unselected');
    expect(getOptionButtonClass(true)).not.toContain('pod-option-button-unselected');
  });

  test('getOptionButtonClass supports compact and disabled modifiers', () => {
    expect(getOptionButtonClass(false, { compact: true })).toContain('pod-option-button--compact');
    expect(getOptionButtonClass(true, { disabled: true })).toContain('pod-option-button-disabled');
  });

  test('getOptionCardClass applies card state classes', () => {
    expect(getOptionCardClass(true)).toContain('pod-option-card-selected');
    expect(getOptionCardClass(false)).toContain('pod-option-card-unselected');
  });

  test('badge helpers return stable class names', () => {
    expect(getOptionSelectedBadgeClass(true)).toBe('pod-option-selected-badge');
    expect(getOptionSelectedBadgeClass(false)).toBe('pod-option-unselected-badge');
    expect(getOptionInlineBadgeClass()).toBe('pod-option-inline-badge');
  });
});
