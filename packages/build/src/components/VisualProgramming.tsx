import React, { PropsWithChildren, useEffect, useRef } from 'react';
import * as ts from 'typescript';
import { useLocalStore, useObserver } from 'mobx-react';
import MonacoEditor from 'react-monaco-editor';
import * as dedent from 'dedent';
import { useReaction } from 'hooks/use-reaction';
import { useEventListener } from 'hooks/use-event-listener';
import { safeLsSet, safeLsGet } from 'models/ls-sync';
import { Portal } from 'react-portal';
import { Transition } from 'react-transition-group';
import { theme } from 'constants/theme.constant';
import ContentEditable from 'react-contenteditable';
import { pull, camelCase, debounce } from 'lodash';
import traverse from 'traverse';
import styled from '@emotion/styled';
import { Switch, Tabs, Tab, Tooltip, IconButton, TextField, MenuItem } from '@material-ui/core';
import { humanCase } from 'functions/human-case.function';
import { appState } from 'constants/app-state.constant';
import { ShoppingCart, Code, BubbleChart } from '@material-ui/icons';

// TODO: add default lib to the language services below too
monaco.languages.typescript.typescriptDefaults.addExtraLib(`
  declare var state = any;
  declare var context = any;
`);

// TODO: get dynamically from typeChecker or languageService
const stateProperties = ['active', 'text'];

export const FILE_NAME = 'code.tsx';

export function getProgramForText(text: string) {
  const dummyFilePath = FILE_NAME;
  const textAst = ts.createSourceFile(dummyFilePath, text, ts.ScriptTarget.Latest);
  const options: ts.CompilerOptions = {};
  const host: ts.CompilerHost = {
    fileExists: filePath => filePath === dummyFilePath,
    directoryExists: dirPath => dirPath === '/',
    getCurrentDirectory: () => '/',
    getDirectories: () => [],
    getCanonicalFileName: fileName => fileName,
    getNewLine: () => '\n',
    getDefaultLibFileName: () => '',
    getSourceFile: filePath => (filePath === dummyFilePath ? textAst : undefined),
    readFile: filePath => (filePath === dummyFilePath ? text : undefined),
    useCaseSensitiveFileNames: () => true,
    writeFile: () => {},
  };
  const languageHost: ts.LanguageServiceHost = {
    getScriptFileNames: () => [FILE_NAME],
    // What is this?
    getScriptVersion: fileName => '3',
    getCurrentDirectory: () => '/',
    getCompilationSettings: () => options,
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
    fileExists: filePath => filePath === dummyFilePath,
    readFile: filePath => (filePath === dummyFilePath ? text : undefined),
    getScriptSnapshot: filePath =>
      filePath === dummyFilePath ? ts.ScriptSnapshot.fromString(text) : undefined,
  };
  const program = ts.createProgram({
    host,
    options,
    rootNames: [dummyFilePath],
  });

  // TODO: reaction for this on code change
  const checker = program.getTypeChecker();

  const languageService = ts.createLanguageService(languageHost);

  return {
    checker,
    languageService,
    program,
  };
}

type LanguageExtension = (node: ts.Node, options: Options) => void | JSX.Element;

export function SetStateExtension(props: AstEditorProps<ts.BinaryExpression>) {
  const { node, options } = props;
  const propertyName = (node.left as ts.PropertyAccessExpression).name as ts.Identifier;
  const value = node.right;

  const fadedBlue = 'rgb(112, 141, 154)';

  const state = useLocalStore(() => ({
    // Get all state properties via typescripts type checker
    getPropertyNames() {
      return options.programState.program
        .getTypeChecker()
        .getTypeAtLocation((node.left as ts.PropertyAccessExpression).expression)
        .getApparentProperties()
        .map(item => item.name);
    },
    getCompletionItems() {
      return options.programState.languageService.getCompletionsAtPosition(
        FILE_NAME,
        (node.left as ts.PropertyAccessExpression).name.getStart(),
        {}
      );
    },
  }));

  return useObserver(() => {
    return (
      <Row>
        <Tooltip
          title={
            // TODO: change the tooltips to be interactive. Right now using the built in component links aren't
            // actually clickable. Change to be more like VS Code's tooltips that can be moused onto and clicked
            <>
              Set a state property.{' '}
              <a css={{ color: theme.colors.primaryLight }}>Learn about state</a>
            </>
          }
        >
          <span>
            <Bubble color={fadedBlue} open="right" options={options}>
              <BubbleChart css={{ fontSize: 16, marginRight: 7, marginLeft: 2, opacity: 0.6 }} />
              Set state
            </Bubble>
          </span>
        </Tooltip>
        <Tooltip
          title={
            <>
              Choose or create a name for your state property.{' '}
              <a css={{ color: theme.colors.primaryLight }}>Learn more</a>
            </>
          }
        >
          <span>
            <Identifier node={propertyName} options={options} />
          </span>
        </Tooltip>
        <Bubble color={fadedBlue} open="both" options={options}>
          To
        </Bubble>
        <Node node={value} options={options} />
      </Row>
    );
  });
}

const SPACER_TOKEN = '__SPACER__';

const createSpacer = () => ts.createIdentifier(SPACER_TOKEN);

const normalizeExpression = (expression: string) => expression.replace(/\s+/g, '');

export function LiquidBubble(props: AstEditorProps<ts.CallExpression>) {
  const { node, options } = props;
  const state = useLocalStore(() => ({
    hovering: false,
    showCode: false,
  }));

  const liquidEditorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (state.showCode && liquidEditorRef.current) {
      setTimeout(() => {
        liquidEditorRef.current?.focus();
      }, 500);
    }
  }, [state.showCode]);

  return useObserver(() => {
    const liquidExpression = node.arguments[0] as ts.StringLiteral;
    const simpleExpression = humanCase(liquidExpression.text.split('|')[0]);
    return (
      <span
        onMouseEnter={() => (state.hovering = true)}
        onMouseLeave={() => (state.hovering = false)}
      >
        <Bubble color="rgb(158,189,89)" htmlMode={false} options={options}>
          <ShoppingCart css={{ fontSize: 14, marginLeft: 2, marginRight: 7, opacity: 0.7 }} />
          <Row css={{ marginRight: 5 }}>
            {simpleExpression}
            <Row
              css={{
                maxWidth: state.showCode ? 500 : 0,
                overflow: 'hidden',
                transition: theme.transitions.for('max-width'),
              }}
            >
              <ContentEditable
                innerRef={liquidEditorRef}
                tagName="pre"
                css={{
                  outline: 'none',
                  cursor: 'text',
                  height: bubbleHeight,
                  marginLeft: 10,
                  lineHeight: bubbleHeight - 1 + 'px',
                  padding: '0 10px',
                  borderLeft: `1px solid rgba(0, 0, 0, 0.1)`,
                  borderRight: `1px solid rgba(0, 0, 0, 0.1)`,
                  backgroundColor: 'rgba(0, 0, 0, 0.2)',
                }}
                html={liquidExpression.text}
                onChange={e => {
                  (node.arguments as any)[0] = ts.createStringLiteral(stripHtml(e.target.value));
                  options.programState.updateCode();
                }}
              />
            </Row>
          </Row>
          <div
            css={{
              width: state.hovering || state.showCode ? 20 : 0,
              opacity: state.hovering || state.showCode ? 1 : 0,
              transition: theme.transitions.for('width', 'opacity'),
            }}
          >
            <Tooltip
              title={
                <>
                  Toggle liquid code. <a css={{ color: theme.colors.primary }}>Learn more</a>{' '}
                </>
              }
            >
              <IconButton
                onMouseDown={e => {
                  e.stopPropagation();
                  state.showCode = !state.showCode;
                }}
                css={{ padding: 2 }}
              >
                <Code css={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </div>
        </Bubble>
      </span>
    );
  });
}

export function EventListener(props: AstEditorProps<ts.CallExpression>) {
  const state = useLocalStore(() => ({}));
  const { options, node } = props;

  const eventNode = node.arguments[0] as ts.StringLiteral;
  const callback = node.arguments[1] as ts.ArrowFunction;

  return useObserver(() => {
    return (
      <Stack>
        <Row>
          <Bubble color="rgb(121, 165, 245)" options={options}>
            On page
            <TextField
              SelectProps={{
                style: {
                  paddingTop: 0,
                  paddingBottom: 0,
                  paddingLeft: 5,
                },
              }}
              InputProps={{
                disableUnderline: true,
                style: {
                  fontSize: 'inherit',
                },
              }}
              css={{ marginLeft: 5, fontSize: 'inherit' }}
              select
              value={eventNode.text}
              onChange={e => {
                (node.arguments as any)[0] = ts.createStringLiteral(stripHtml(e.target.value));
                options.programState.updateCode();
              }}
            >
              {['scroll', 'click', 'mousedown', 'keypress'].map(item => (
                <MenuItem value={item} key={item}>
                  {humanCase(item).toLowerCase()}
                </MenuItem>
              ))}
            </TextField>
          </Bubble>
        </Row>
        {callback.body && <Node node={callback.body} options={options} />}
      </Stack>
    );
  });
}

const languageExtensions: LanguageExtension[] = [
  // Liquid bubbles
  (node, options) => {
    if (
      ts.isCallExpression(node) &&
      normalizeExpression(node.getText().split('(')[0]) === 'context.shopify.liquid.get' &&
      node.arguments.length &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      return <LiquidBubble node={node} options={options} />;
    }
  },
  // Liquid bubbles
  (node, options) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      normalizeExpression(node.getText()) === 'document.body.scrollTop'
    ) {
      return (
        <Bubble color={theme.colors.primary} options={options}>
          Page scroll position
        </Bubble>
      );
    }
  },
  // Liquid bubbles
  (node, options) => {
    if (
      ts.isCallExpression(node) &&
      normalizeExpression(node.getText().split('(')[0]) === 'document.addEventListener'
    ) {
      return <EventListener node={node} options={options} />;
    }
  },
  // Render spacers
  (node, options) => {
    if (ts.isIdentifier(node) && node.text === SPACER_TOKEN) {
      // TODO: make component and listen for mouseup and delete all spacers
      return (
        <div
          className="spacer"
          css={{
            flexGrow: 1,
            alignSelf: 'stretch',
            minWidth: 50,
            minHeight: 50,
            borderRadius: 6,
            backgroundColor: theme.colors.primaryWithOpacity(0.5),
            boreder: `1px solid ${theme.colors.primaryWithOpacity(0.9)}`,
          }}
        />
      );
    }
  },

  // `state.foo = 'bar' to "set state"
  (node, options) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.getText() === '=') {
      if (ts.isPropertyAccessExpression(node.left)) {
        if (
          ts.isIdentifier(node.left.expression) &&
          node.left.expression.text === 'state' &&
          ts.isIdentifier(node.left.name)
        ) {
          return <SetStateExtension node={node} options={options} />;
        }
      }
    }
  },
];

const replace = <T extends any>(arr: T[], newArr: T[]) => {
  arr.length = 0;
  arr.push(...newArr);
};

const Row = styled.div({ display: 'flex', alignItems: 'center', flexWrap: 'wrap' });
const Stack = styled.div({ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' });

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

const findKey = (obj: { [key: string]: any }, value: object) => {
  for (const key in obj) {
    if (obj[key] === value) {
      return key;
    }
  }
};

const replaceNode = (oldNode: ts.Node, newNode: ts.Node) => {
  const key = findKey(oldNode.parent, oldNode);
  if (key) {
    (oldNode.parent as any)[key] = newNode;
  } else {
    console.error('Could not find key to replace node', { oldNode, newNode });
  }
};

type VisualProgrammingProps = {
  className?: string;
};

export type ProgramState = {
  draggingNode: ts.Node | null;
  hoveringNode: ts.Node | null;
  ast: ts.SourceFile;
  selection: ts.Node[];
  updateCode: () => void;
  hoveringCodeEditor: boolean;
  program: ts.Program;
  languageService: ts.LanguageService;
};

type Options = {
  programState: ProgramState;
};

interface AstEditorProps<NodeType = ts.Node> {
  options: Options;
  node: NodeType;
}

const stripHtml = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.innerText;
};

const localStorageCodeKey = 'builder.experiments.visualProgramming.code';

export function VariableStatement(props: AstEditorProps<ts.VariableStatement>) {
  const { node, options } = props;
  return useObserver(() => {
    return (
      <>
        {node.declarationList.declarations.map((item, index) => (
          <Node node={item} key={index} options={options} />
        ))}
      </>
    );
  });
}

export function CallExpression(props: AstEditorProps<ts.CallExpression>) {
  const { node, options } = props;
  return useObserver(() => {
    return (
      <Row>
        <Bubble color="rgb(144, 87, 218)" options={options} open="right">
          Do action
        </Bubble>
        {node.expression && <Node node={node.expression} options={options} />}
        {node.arguments &&
          node.arguments.map((arg, index) => {
            const isFirst = index === 0;
            return (
              <React.Fragment key={index}>
                <Bubble humanCase={false} options={options} open="both" css={{ zIndex: 0 }}>
                  {isFirst ? 'With' : ','}
                </Bubble>
                <Node node={arg} options={options} />
              </React.Fragment>
            );
          })}
      </Row>
    );
  });
}

export function Identifier(
  props: AstEditorProps<ts.Identifier> & { open?: 'left' | 'right' | 'both'; color?: string }
) {
  const { node, options } = props;
  return useObserver(() => {
    const isActive = Boolean(
      options.programState.selection.find(item => ts.isIdentifier(item) && item.text === node.text)
    );

    return (
      <Bubble
        options={options}
        onFocus={() => replace(options.programState.selection, [node])}
        onBlur={() => {
          if (options.programState.selection.includes(node)) {
            pull(options.programState.selection, node);
          }
        }}
        open={props.open}
        active={isActive}
        color={props.color || theme.colors.primary}
        onChange={text => {
          const file = node.getSourceFile();
          const newNode = ts.createIdentifier(text);

          // Update all references to this identifier
          // TODO: use ts.transform or ts.visitEachChild or another
          // built-in API after figuring out which one is actually right for this
          traverse(file).forEach((child: any) => {
            if (
              child &&
              ts.isIdentifier(child) &&
              !(
                ts.isPropertyAssignment(child.parent) || ts.isPropertyAccessExpression(child.parent)
              ) &&
              child.text === node.text
            ) {
              // Identifiers seem to be immutable in TS AST
              replaceNode(child, newNode);
            }
          });
          options.programState.updateCode();
        }}
      >
        {node.text}
      </Bubble>
    );
  });
}

const bubbleHeight = 30;

export function Bubble(
  props: PropsWithChildren<{
    options: Options;
    color?: string;
    active?: boolean;
    className?: string;
    onFocus?: (event: React.FocusEvent<HTMLElement>) => void;
    onBlur?: (event: React.FocusEvent<HTMLElement>) => void;
    onChange?: (text: string) => void;
    open?: 'right' | 'left' | 'both' | 'none';
    humanCase?: boolean;
    htmlMode?: boolean;
  }>
) {
  const size = bubbleHeight;

  const spacerStyles: Partial<React.CSSProperties> = {
    backgroundColor: '#222',
    width: size + 3,
    height: size + 4,
    borderRadius: 100,
  };

  const openLeft = props.open === 'left' || props.open === 'both';
  const openRight = props.open === 'right' || props.open === 'both';

  const gap = 3;
  const htmlMode = props.htmlMode === true || props.onChange;

  return useObserver(() => (
    <div
      css={{
        opacity: props.active ? 1 : 0.8,
        borderRadius: 50,
        height: size,
        paddingLeft: 10 + (openLeft ? size / 2 : 0),
        paddingRight: 10 + (openRight ? size / 2 : 0),
        display: 'flex',
        alignItems: 'center',
        cursor: 'pointer',
        position: 'relative',
        zIndex: openLeft ? 1 : 2,
        backgroundColor: props.color || '#555',
        marginTop: 5,
        marginBottom: 5,
        marginLeft: gap,
        marginRight: gap,
        ...(openRight && {
          marginRight: -size + gap,
        }),
        ...(openLeft && {
          marginLeft: -size + gap,
        }),
      }}
      className={props.className}
    >
      {openLeft && (
        <div
          css={{
            ...spacerStyles,
            marginRight: 5,
            marginLeft: -size,
          }}
        />
      )}
      {!htmlMode ? (
        props.children
      ) : (
        <ContentEditable
          css={{ outline: 'none', cursor: props.onChange ? 'text' : 'pointer' }}
          onFocus={props.onFocus}
          onBlur={props.onBlur}
          disabled={!props.onChange}
          html={
            props.humanCase === false
              ? (props.children as string)
              : humanCase(props.children as string)
          }
          onChange={e => {
            props.onChange?.(camelCase(stripHtml(e.target.value)));
            props.options.programState.updateCode();
          }}
        />
      )}
      {openRight && (
        <div
          css={{
            ...spacerStyles,
            marginLeft: 5,
            marginRight: -size,
          }}
        />
      )}
    </div>
  ));
}

export function VariableDeclaration(props: AstEditorProps<ts.VariableDeclaration>) {
  const { node, options } = props;
  return useObserver(() => {
    return (
      <Row>
        <Bubble options={options} open="right">
          Set
        </Bubble>
        <Node node={node.name} options={options} />
        <Bubble options={options} open="both">
          To
        </Bubble>
        {node.initializer && <Node node={node.initializer} options={options} />}
      </Row>
    );
  });
}

export function Block(props: AstEditorProps<ts.Block>) {
  const { node, options } = props;
  const tabSpace = 40;
  return useObserver(() => {
    return (
      <Stack
        css={{
          paddingLeft: tabSpace,
          position: 'relative',
          width: '100%',
          paddingBottom: 10,
        }}
      >
        <div
          css={{
            backgroundColor: '#333',
            top: 0,
            bottom: 10,
            width: 2,
            borderRadius: 4,
            position: 'absolute',
            left: tabSpace / 1.5,
          }}
        />
        {node.statements.map((item, index) => (
          <Node key={index} node={item} options={options} />
        ))}
      </Stack>
    );
  });
}

export function ExpressionStatement(props: AstEditorProps<ts.ExpressionStatement>) {
  const { node, options } = props;
  return useObserver(() => {
    return <>{node.expression && <Node node={node.expression} options={options} />}</>;
  });
}

export function ReturnStatement(props: AstEditorProps<ts.ReturnStatement>) {
  const { node, options } = props;
  return useObserver(() => {
    return (
      <Row>
        <Bubble color="rgb(134, 107, 218)" options={options} open="right">
          Respond
        </Bubble>
        {node.expression && <Node node={node.expression} options={options} />}
      </Row>
    );
  });
}

export function FunctionDeclaration(props: AstEditorProps<ts.FunctionDeclaration>) {
  const { node, options } = props;

  const color = 'rgb(226, 158, 56)';

  return useObserver(() => {
    return (
      <Stack>
        <Row>
          <Bubble color={color} options={options} open="right">
            Create action named
          </Bubble>
          {node.name && <Node node={node.name} options={options} />}
          <Bubble humanCase={false} color={color} options={options} open="left">
            that does
          </Bubble>
        </Row>
        {node.body && <Node node={node.body} options={options} />}
      </Stack>
    );
  });
}
export function ArrowFunction(props: AstEditorProps<ts.ArrowFunction>) {
  const { node, options } = props;

  const color = 'rgb(226, 158, 56)';

  return useObserver(() => {
    return (
      <span>
        <Row>
          <Bubble color={color} options={options}>
            Do
          </Bubble>
        </Row>
        {node.body && <Node node={node.body} options={options} />}
      </span>
    );
  });
}

export function IfStatement(props: AstEditorProps<ts.IfStatement>) {
  const { node, options } = props;

  const thenHasIf = node.elseStatement && ts.isIfStatement(node.elseStatement);

  return useObserver(() => {
    return (
      <>
        <Row>
          <Bubble options={options} open="right">
            If
          </Bubble>
          <Node node={node.expression} options={options} />
        </Row>
        <Node node={node.thenStatement} options={options} />
        {thenHasIf ? (
          <Row>
            <Bubble options={options} open="right">
              Otherwise
            </Bubble>
            <Node node={node.elseStatement!} options={options} />
          </Row>
        ) : (
          node.elseStatement && (
            <>
              <Bubble options={options}>Otherwise</Bubble>
              <Node node={node.elseStatement} options={options} />
            </>
          )
        )}
      </>
    );
  });
}

export function SourceFile(props: AstEditorProps<ts.SourceFile>) {
  const { node, options } = props;
  return useObserver(() => {
    return (
      <Stack>
        {node.statements.map((item, index) => (
          <Node node={item} key={index} options={options} />
        ))}
      </Stack>
    );
  });
}
export function BinaryExpression(props: AstEditorProps<ts.BinaryExpression>) {
  const { node, options } = props;

  const tokenText = node.operatorToken.getText();

  const isEquals = tokenText === '=';

  const textMap: { [key: string]: string | undefined } = {
    '===': 'is',
    '==': 'is',
    '&&': 'and',
    '||': 'or',
    '!==': 'is not',
    '!=': 'is not',
  };

  const useText = textMap[tokenText] || tokenText;

  return useObserver(() => {
    return (
      <Row>
        {isEquals && (
          <Bubble options={options} open="right">
            Set
          </Bubble>
        )}
        <Node node={node.left} options={options} />
        <Bubble css={{ zIndex: 0 }} options={options} open="both">
          {useText}
        </Bubble>
        <Node node={node.right} options={options} />
      </Row>
    );
  });
}

const booleanBubbleStyles: Partial<React.CSSProperties> = {
  height: bubbleHeight,
  display: 'flex',
  alignItems: 'center',
  borderRadius: bubbleHeight,
  backgroundColor: '#555',
  position: 'relative',
  marginLeft: 3,
  zIndex: 2,
};

export function TrueKeyword(props: AstEditorProps<ts.Node>) {
  const { node, options } = props;
  return useObserver(() => {
    return (
      <div css={booleanBubbleStyles}>
        <Tooltip title="True">
          <Switch
            color="primary"
            checked
            onChange={() => {
              replaceNode(node, ts.createFalse());
              options.programState.updateCode();
            }}
          />
        </Tooltip>
      </div>
    );
  });
}
export function FalseKeyword(props: AstEditorProps<ts.Node>) {
  const { node, options } = props;
  return useObserver(() => {
    return (
      <div css={booleanBubbleStyles}>
        <Tooltip title="False">
          <Switch
            color="primary"
            onChange={() => {
              replaceNode(node, ts.createTrue());
              options.programState.updateCode();
            }}
          />
        </Tooltip>
      </div>
    );
  });
}

/**
 * This is things like `!foo` or `!state.foo` or `+foo`
 */
export function PrefixUnaryExpression(props: AstEditorProps<ts.PrefixUnaryExpression>) {
  const { node, options } = props;

  return useObserver(() => {
    return (
      <Row>
        {/* 
          TODO: handle other operators than "!", e.g. `-foo` of `-10`
          Rarer ones to add eventually are also things like `+foo` and `~foo` etc
         */}
        <Bubble open="right" options={options}>
          Not
        </Bubble>
        <Node options={options} node={node.operand} />
      </Row>
    );
  });
}
export function PropertyAccessExpression(props: AstEditorProps<ts.PropertyAccessExpression>) {
  const { node, options } = props;
  return useObserver(() => {
    return (
      <Row>
        <Node options={options} node={node.expression} />
        <Identifier
          color={theme.colors.primaryLight}
          options={options}
          node={node.name as ts.Identifier}
          open="left"
        />
      </Row>
    );
  });
}

// TODO: if works for comments rename to NodeWrapper or something
export function Hoverable(props: PropsWithChildren<{ node: ts.Node; options: Options }>) {
  const { options, node } = props;
  const state = useLocalStore(() => ({
    onMouseEnter() {
      options.programState.hoveringNode = node;
      if (options.programState.draggingNode) {
        // TODO: find first AST element parent that is an array, make that the subject, splice in
        // the spacer
      }
    },
    onMouseLeave() {
      if (options.programState.hoveringNode === node) {
        options.programState.hoveringNode = null;
        // TODO: remove all spacers from AST
      }
    },
  }));

  // TODO: turn back on when updated to handle below tasks
  const renderComments = false as boolean;

  const comments =
    renderComments &&
    ts.getLeadingCommentRanges(options.programState.ast.getFullText(), node.getFullStart());

  return (
    <>
      {/* 
      TODO: special handling for jsdoc style 
      TODO: handle same comment matching multiple times
      TODO: make editable
    */}
      {renderComments &&
        comments &&
        comments.map((item, index) => (
          <Stack
            css={{ whiteSpace: 'pre', margin: 10, color: '#999' }}
            className="comment"
            key={index}
          >
            {options.programState.ast.getFullText().slice(item.pos, item.end)}
          </Stack>
        ))}
      <span
        // TODO: improve this logic and get it back in
        // onMouseDown={() => {
        //   if (!ts.isLiteralExpression(node)) {
        //     options.programState.draggingNode = node;
        //   }
        // }}
        onMouseEnter={state.onMouseEnter}
        onMouseLeave={state.onMouseLeave}
      >
        {props.children}
      </span>
    </>
  );
}

const hoverable = (
  node: ts.Node,
  options: Options,
  children: JSX.Element | (() => JSX.Element)
) => (
  <Hoverable node={node} options={options}>
    {typeof children === 'function' ? children() : children}
  </Hoverable>
);

export function Node(props: AstEditorProps<ts.Node>) {
  const { node, options } = props;
  return useObserver(() =>
    hoverable(node, options, () => {
      for (const extension of languageExtensions) {
        const result = extension(node, options);
        if (result) {
          return result;
        }
      }
      if (ts.isVariableStatement(node)) {
        return <VariableStatement node={node} options={options} />;
      }
      if (ts.isVariableDeclaration(node)) {
        return <VariableDeclaration node={node} options={options} />;
      }
      if (ts.isSourceFile(node)) {
        return <SourceFile node={node} options={options} />;
      }
      if (ts.isIdentifier(node)) {
        return <Identifier node={node} options={options} />;
      }
      if (ts.isPropertyAccessExpression(node)) {
        return <PropertyAccessExpression node={node} options={options} />;
      }
      if (ts.isBinaryExpression(node)) {
        return <BinaryExpression node={node} options={options} />;
      }
      if (ts.isFunctionDeclaration(node)) {
        return <FunctionDeclaration node={node} options={options} />;
      }
      if (ts.isArrowFunction(node)) {
        return <ArrowFunction node={node} options={options} />;
      }
      if (ts.isPrefixUnaryExpression(node)) {
        return <PrefixUnaryExpression node={node} options={options} />;
      }
      if (ts.isBlock(node)) {
        return <Block node={node} options={options} />;
      }
      if (ts.isExpressionStatement(node)) {
        return <ExpressionStatement node={node} options={options} />;
      }
      if (ts.isCallExpression(node)) {
        return <CallExpression node={node} options={options} />;
      }
      if (ts.isReturnStatement(node)) {
        return <ReturnStatement node={node} options={options} />;
      }
      if (ts.isIfStatement(node)) {
        return <IfStatement node={node} options={options} />;
      }

      // Can't seem to find a `ts.is*` method for these like the above
      if (node.kind === 106) {
        return <TrueKeyword node={node} options={options} />;
      }
      if (node.kind === 91) {
        return <FalseKeyword node={node} options={options} />;
      }

      if (ts.isStringLiteral(node)) {
        return (
          <Bubble
            options={options}
            color="rgb(189, 63, 241)"
            onChange={text => {
              node.text = text;
            }}
          >
            {node.text}
          </Bubble>
        );
      }
      if (ts.isNumericLiteral(node)) {
        return (
          <Bubble
            options={options}
            color="rgb(189, 63, 241)"
            onChange={text => {
              node.text = text;
            }}
          >
            {node.text}
          </Bubble>
        );
      }

      return (
        <Bubble options={options}>
          <Tooltip title="Custom code - click to view">
            <IconButton
              css={{ padding: 5 }}
              onClick={() =>
                appState.globalState.openDialog(
                  <div
                    css={{
                      padding: 20,
                      backgroundColor: '#333',
                      minWidth: 300,
                      width: '90vw',
                      maxWidth: 1000,
                      height: '90vh',
                      maxHeight: 800,
                      position: 'relative',
                    }}
                  >
                    <MonacoEditor
                      language="typescript"
                      theme="vs-dark"
                      defaultValue={printer.printNode(
                        ts.EmitHint.Unspecified,
                        node,
                        node.getSourceFile()
                      )}
                      options={{
                        fontSize: 11,
                        renderLineHighlight: 'none',
                        minimap: { enabled: false },
                        scrollbar: {
                          horizontal: 'hidden',
                          vertical: 'hidden',
                        },
                        automaticLayout: true,
                        scrollBeyondLastLine: false,
                      }}
                      onChange={val => {
                        replaceNode(node, parseCode(val));
                        options.programState.updateCode();
                      }}
                    />
                    {/* <ContentEditable
                      css={{ whiteSpace: 'pre', color: '#777', fontFamily: 'roboto' }}
                      html={printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile())}
                      onChange={() => null}
                    /> */}
                  </div>
                )
              }
            >
              <Code
                css={{
                  fontSize: 20,
                  color: 'black',
                  margin: '0 -10px',
                }}
              />
            </IconButton>
          </Tooltip>
        </Bubble>
      );
    })
  );
}

export const createSourceFile = (code: string) => {
  return ts.createSourceFile(FILE_NAME, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
};

// TODO: support multiple statements
const parseCode = (code: string) => {
  const file = createSourceFile(code);
  return file.statements[0];
};

const defaultTemplates = [
  [`state.active = true`, 'state'],
  [`state.text = 'Hello!'`, 'state'],
  // TODO: make shopify dynamic, for instance if there is a product-like name in current scope
  [`context.shopify.liquid.get('product.price | currency')`, 'shopify'],
  [`context.shopify.liquid.get('product.name')`, 'shopify'],
  [`context.shopify.liquid.get('product.description')`, 'shopify'],
  [
    dedent`document.addEventListener('scroll', event => {
      if (document.body.scrollTop > 10) {
        state.scrolledDown = true
      }
    })`,
    'logic',
  ],
  [
    dedent`if (state.active) {
      state.active = false;
    }`,
    'logic',
  ],
  [
    dedent`function toggleState() {
      state.active = !state.active;
    }`,
    'logic',
  ],
].map(item => {
  const [code, ...tags] = item;
  return {
    tags,
    ast: parseCode(code),
  };
});

function Draggable(props: { node: ts.Node; options: Options }) {
  const { node, options } = props;
  return useObserver(() => (
    <Stack
      onMouseDown={e => {
        e.preventDefault();
        options.programState.draggingNode = node;
      }}
      css={{
        opacity: 0.85,
        marginBottom: 5,
        cursor: 'pointer',
        '&:hover': {
          opacity: 1,
        },
        '& *': {
          pointerEvents: 'none',
        },
      }}
    >
      <Node options={options} node={node} />
    </Stack>
  ));
}

function DraggingNodeOverlay(props: { options: Options }) {
  const { options } = props;
  return useObserver(() => {
    const node = options.programState.draggingNode;
    return (
      node && (
        <div
          css={{
            position: 'fixed',
            top: appState.document.mouseY + 5,
            left: appState.document.mouseX + 5,
            zIndex: 10,
            pointerEvents: 'none',
            paddingRight: 5,
            paddingLeft: 2,
            backdropFilter: 'blur(20px)',
            borderRadius: 50,
            background: 'rgba(0, 0, 0, 0.1)',
          }}
        >
          <Node node={node} options={options} />
        </div>
      )
    );
  });
}

function Toolbox(props: { options: Options; className?: string }) {
  const { options } = props;
  const templates = defaultTemplates;

  const TAB_KEY = 'builder.experiments.visualCodingTab';

  const state = useLocalStore(() => ({
    tab: safeLsGet(TAB_KEY) ?? 0,
  }));

  useReaction(
    () => state.tab,
    tab => safeLsSet(TAB_KEY, tab)
  );

  const tabStyle: Partial<React.CSSProperties> = {
    minWidth: 0,
    minHeight: 0,
    maxWidth: 'none',
    height: 39,
    color: '#888',
  };

  return useObserver(() => {
    return (
      <Stack
        css={{
          padding: 20,
        }}
        className={props.className}
      >
        <Tabs
          css={{ marginBottom: 20, marginTop: -10 }}
          value={state.tab}
          onChange={(e, value) => (state.tab = value)}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab css={tabStyle} label="All" />
          <Tab css={tabStyle} label="State" />
          <Tab css={tabStyle} label="Shopify" />
          <Tab css={tabStyle} label="Logic" />
          <Tab css={tabStyle} label="Learn" />
        </Tabs>
        {templates
          .filter(item => {
            switch (state.tab) {
              case 0:
                return true;
              case 1:
                return item.tags.includes('state');
              case 2:
                return item.tags.includes('shopify');
              case 3:
                return item.tags.includes('logic');
              case 4:
                return false;
            }
          })
          .map((item, index) => (
            <Draggable key={index} options={options} node={item.ast} />
          ))}
      </Stack>
    );
  });
}

export function VisualProgramming(props: VisualProgrammingProps) {
  const state = useLocalStore(() => {
    const initialCode = safeLsGet(localStorageCodeKey) || '';
    return {
      programState: {
        hoveringCodeEditor: false,
        draggingNode: null,
        program: null as any,
        hoveringNode: null,
        updateCode() {
          state.updateCode();
        },
        get ast(): ts.SourceFile {
          return state.ast;
        },
        get selection(): ts.Node[] {
          return state.selection;
        },
        set selection(arr) {
          replace(state.selection, arr);
        },
      } as ProgramState,
      selection: [] as ts.Node[],
      code: initialCode,
      ast: createSourceFile(initialCode),
      codeToAst(this: { code: string }, code = this.code) {
        return createSourceFile(code);
      },
      astToCode(this: { ast: ts.SourceFile | null }, ast = this.ast) {
        return !ast ? '' : printer.printFile(ast);
      },
      updateAst() {
        this.ast = this.codeToAst(this.code);
      },
      updateCode() {
        this.code = this.astToCode(this.ast as ts.SourceFile);
      },
    };
  });

  useReaction(
    () => state.code,
    code => safeLsSet(localStorageCodeKey, code)
  );

  useReaction(
    () => state.code,
    () => {
      state.updateAst();

      const tsInfo = getProgramForText(state.code);
      state.programState.program = tsInfo.program;
      state.programState.languageService = tsInfo.languageService;
    }
  );

  useEventListener(document, 'mouseup', () => {
    if (state.programState.draggingNode) {
      if (state.programState.hoveringCodeEditor) {
        const node = state.programState.draggingNode;
        traverse(node).forEach(function (child) {
          if (child && ts.isStringLiteral(child)) {
            this.update(ts.createStringLiteral(child.text));
          }
          if (child && ts.isNumericLiteral(child)) {
            this.update(ts.createNumericLiteral(child.text));
          }
        });
        // TODO: modify AST here
        state.code += '\n' + printer.printNode(ts.EmitHint.Unspecified, node, state.ast);
      }

      state.programState.draggingNode = null;
    }
  });

  useEventListener(document, 'keydown', e => {
    const event = e as KeyboardEvent;
    // Esc key
    if (event.which === 27 && state.programState.draggingNode) {
      state.programState.draggingNode = null;
    }
  });

  return useObserver(() => {
    const options = { programState: state.programState };
    return (
      <div
        css={{
          height: '100vh',
          overflow: 'hidden',
          display: 'flex',
          backgroundColor: '#222',
        }}
        className={props.className}
      >
        <Portal>
          <Transition timeout={200} unmountOnExit appear in mountOnEnter>
            {transitionState => (
              <div
                className="sidebar-darkening-overlay"
                css={{
                  backgroundBlendMode: 'multiply',
                  position: 'fixed',
                  backgroundColor: 'rgba(0, 0, 0, 0.45)',
                  pointerEvents: 'none',
                  opacity: transitionState === 'entered' ? 1 : 0,
                  transition: 'opacity 0.2s ease-in-out',
                  top: 0,
                  width: 300,
                  left: 0,
                  bottom: 0,
                }}
              />
            )}
          </Transition>
        </Portal>
        <div
          css={{
            width: '50%',
            height: '100%',
          }}
        >
          <div css={{ height: '100%', overflow: 'auto', fontSize: 14 }}>
            <Toolbox options={options} />
          </div>
        </div>
        <div
          css={{ width: '50%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
        >
          <div
            css={{
              height: '50%',
              fontSize: 14,
              padding: 20,
              overflow: 'auto',
            }}
            onMouseEnter={() => {
              state.programState.hoveringCodeEditor = true;
            }}
            onMouseLeave={() => {
              state.programState.hoveringCodeEditor = false;
            }}
          >
            {state.ast && <Node node={state.ast} options={options} />}
            {state.programState.draggingNode &&
              !state.programState.hoveringNode &&
              state.programState.hoveringCodeEditor && (
                <div
                  css={{
                    backgroundColor: theme.colors.primary,
                    height: 2,
                    borderRadius: 10,
                    width: '100%',
                  }}
                />
              )}
            <DraggingNodeOverlay options={options} />
          </div>
          <div
            css={{
              height: '50%',
              '.monaco-editor, .monaco-editor-background, .monaco-editor .inputarea.ime-input, .monaco-editor .margin': {
                backgroundColor: 'transparent !important',
              },
            }}
          >
            <MonacoEditor
              language="typescript"
              theme="vs-dark"
              value={state.code}
              options={{
                fontSize: 11,
                renderLineHighlight: 'none',
                minimap: { enabled: false },
                scrollbar: {
                  horizontal: 'hidden',
                  vertical: 'hidden',
                },
                automaticLayout: true,
                scrollBeyondLastLine: false,
              }}
              onChange={val => {
                state.code = val;
              }}
            />
          </div>
        </div>
      </div>
    );
  });
}
