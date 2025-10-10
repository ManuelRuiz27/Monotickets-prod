'use client';

import React from 'react';
import { tabStyles } from '../../../shared/theme';

type TabsContextValue = {
  activeTab: string;
  setActiveTab: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined);

interface TabsProps {
  defaultValue: string;
  'aria-label'?: string;
  children: React.ReactNode;
}

export function Tabs({ defaultValue, children, 'aria-label': ariaLabel }: TabsProps) {
  const [activeTab, setActiveTab] = React.useState(defaultValue);
  const prefersReducedMotion = React.useMemo(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
    []
  );

  const value = React.useMemo(() => ({ activeTab, setActiveTab }), [activeTab]);

  return (
    <TabsContext.Provider value={value}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        style={{
          ...parseStyles(tabStyles.list),
          transition: prefersReducedMotion ? 'none' : undefined,
        }}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

interface TabProps {
  value: string;
  children: React.ReactNode;
}

export function TabTrigger({ value, children }: TabProps) {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error('TabTrigger must be used within Tabs');
  }
  const { activeTab, setActiveTab } = context;
  const isActive = activeTab === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-controls={`${value}-panel`}
      id={`${value}-tab`}
      onClick={() => setActiveTab(value)}
      style={{
        ...parseStyles(tabStyles.trigger),
        ...(isActive ? parseStyles(tabStyles.triggerActive) : {}),
      }}
      dangerouslySetInnerHTML={{ __html: React.Children.toArray(children).join('') }}
    />
  );
}

interface TabPanelProps {
  value: string;
  children: React.ReactNode;
}

export function TabPanel({ value, children }: TabPanelProps) {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error('TabPanel must be used within Tabs');
  }
  const { activeTab } = context;
  const hidden = activeTab !== value;
  return (
    <div
      role="tabpanel"
      id={`${value}-panel`}
      aria-labelledby={`${value}-tab`}
      hidden={hidden}
    >
      {!hidden && children}
    </div>
  );
}

function parseStyles(inline: string): React.CSSProperties {
  return inline.split(';').reduce<React.CSSProperties>((acc, declaration) => {
    const [property, rawValue] = declaration.split(':').map((part) => part.trim());
    if (!property || !rawValue) return acc;
    const camelCaseProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return { ...acc, [camelCaseProperty]: rawValue };
  }, {});
}
