const fs = require('fs').promises;
const path = require('path');
const marked = require('marked');

// Configure marked for security and to allow HTML in Markdown
marked.setOptions({
    headerIds: false,
    mangle: false,
    breaks: true,
    html: true
});

async function readTemplate(templateName) {
    const template = await fs.readFile(
        path.join(__dirname, '../src/templates/', templateName),
        'utf-8'
    );
    return template;
}

function extractFrontMatter(content) {
    const frontMatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontMatterRegex);
    
    if (!match) {
        return {
            metadata: {},
            content: content
        };
    }

    const metadata = {};
    const frontMatter = match[1];
    const markdownContent = match[2];

    // Parse simple key-value pairs
    frontMatter.split('\n').forEach(line => {
        const [key, value] = line.split(':').map(s => s.trim());
        if (key && value) {
            metadata[key] = value;
        }
    });

    return {
        metadata,
        content: markdownContent
    };
}

async function convertMarkdownFile(filePath) {
    const markdown = await fs.readFile(filePath, 'utf-8');
    const { metadata, content } = extractFrontMatter(markdown);
    const html = marked.parse(content);
    return { metadata, html };
}

async function getAllBlogPosts() {
    const postsDir = path.join(__dirname, '../content/blog/posts');
    try {
        const posts = await fs.readdir(postsDir);
        const postData = [];

        for (const post of posts) {
            if (post.endsWith('.md')) {
                const filePath = path.join(postsDir, post);
                const { metadata } = await convertMarkdownFile(filePath);
                postData.push({
                    ...metadata,
                    url: `./blog/${post.replace('.md', '.html')}`,
                    filename: post
                });
            }
        }

        // Sort posts by date, most recent first
        return postData.sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (error) {
        console.error('Error reading blog posts:', error);
        return [];
    }
}

function generateBlogList(posts) {
    return `
        <div class="blog-posts">
            ${posts.map(post => `
                <article class="blog-preview">
                    <h2><a href="${post.url}">${post.title}</a></h2>
                    <div class="post-meta">
                        <span class="post-date">${post.date}</span>
                        <span class="post-author">${post.author}</span>
                    </div>
                </article>
            `).join('')}
        </div>
    `;
}

async function buildPage(markdownPath, templatePath, outputPath, extraData = {}) {
    try {
        const template = await readTemplate(templatePath);
        const { metadata, html } = await convertMarkdownFile(markdownPath);
        
        // Get blog posts if this is the blog index
        let blogList = '';
        if (outputPath.endsWith('blog.html')) {
            const posts = await getAllBlogPosts();
            blogList = generateBlogList(posts);
        }
        
        // Replace metadata and content in template
        let finalHtml = template
            .replace('{{content}}', html)
            .replace('{{title}}', metadata.title || 'FinCafe')
            .replace('{{description}}', metadata.description || '')
            .replace('{{date}}', metadata.date || '')
            .replace('{{author}}', metadata.author || '')
            .replace('<!-- Blog posts will be dynamically inserted here -->', blogList);
        
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, finalHtml);
        
        console.log(`Built: ${outputPath}`);
    } catch (error) {
        console.error(`Error building ${markdownPath}:`, error);
    }
}

async function build() {
    // Build pages
    const pages = [
        {
            markdown: 'content/pages/index.md',
            template: 'page.html',
            output: 'dist/index.html'
        },
        {
            markdown: 'content/pages/about.md',
            template: 'page.html',
            output: 'dist/about.html'
        },
        {
            markdown: 'content/pages/blog.md',
            template: 'page.html',
            output: 'dist/blog.html'
        },
        {
            markdown: 'content/pages/faq.md',
            template: 'page.html',
            output: 'dist/faq.html'
        }
    ];

    for (const page of pages) {
        await buildPage(page.markdown, page.template, page.output);
    }

    // Build blog posts
    const postsDir = path.join(__dirname, '../content/blog/posts');
    try {
        const posts = await fs.readdir(postsDir);
        
        for (const post of posts) {
            if (post.endsWith('.md')) {
                const outputName = post.replace('.md', '.html');
                await buildPage(
                    path.join(postsDir, post),
                    'blog-post.html',
                    path.join('dist/blog', outputName)
                );
            }
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Error reading blog posts directory:', error);
        }
    }

    // Copy static assets
    try {
        await fs.cp(
            path.join(__dirname, '../src/css'),
            path.join(__dirname, '../dist/css'),
            { recursive: true }
        );
        await fs.cp(
            path.join(__dirname, '../src/js'),
            path.join(__dirname, '../dist/js'),
            { recursive: true }
        );
        await fs.cp(
            path.join(__dirname, '../src/assets'),
            path.join(__dirname, '../dist/assets'),
            { recursive: true }
        );
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('Error copying static assets:', error);
        }
    }
}

build().catch(console.error); 