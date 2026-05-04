use echo_studio_lib::echovault::{EchoVaultRepo, MemoriesFilter};

fn open_repo() -> EchoVaultRepo {
    EchoVaultRepo::open().expect("real ~/.memory/index.db must exist for golden tests")
}

#[test]
#[ignore]
fn golden_list_returns_real_memories() {
    let repo = open_repo();
    let page = repo.list(&MemoriesFilter::default()).expect("list");

    assert!(page.total > 0, "expected non-empty memories DB");
    assert!(!page.items.is_empty(), "expected at least one item");
    assert!(!page.projects.is_empty(), "expected project counts");
    assert!(!page.memory_home.is_empty(), "memory_home must be reported");

    let first = &page.items[0];
    assert!(!first.id.is_empty(), "id must be non-empty");
    assert!(!first.title.is_empty(), "title must be non-empty");
    assert!(!first.what.is_empty(), "what must be non-empty");
    assert!(!first.project.is_empty(), "project must be non-empty");
    assert_eq!(first.status, "active");
    assert!(
        first.tags.iter().all(|t| !t.is_empty()),
        "tags must not contain empty strings"
    );
}

#[test]
#[ignore]
fn golden_filter_by_project_returns_subset() {
    let repo = open_repo();
    let all = repo.list(&MemoriesFilter::default()).expect("list-all");
    let first_project = all
        .projects
        .first()
        .expect("at least one project")
        .project
        .clone();

    let filtered = repo
        .list(&MemoriesFilter {
            project: Some(first_project.clone()),
            ..Default::default()
        })
        .expect("filtered list");

    assert!(filtered.items.iter().all(|m| m.project == first_project));
    assert!(filtered.total > 0);
    assert!(filtered.total <= all.total);
}

#[test]
#[ignore]
fn golden_get_returns_body_for_first_memory() {
    let repo = open_repo();
    let page = repo
        .list(&MemoriesFilter {
            limit: Some(1),
            ..Default::default()
        })
        .expect("list");
    let first = page.items.first().expect("at least one memory");

    let detail = repo
        .get(&first.id)
        .expect("get")
        .expect("memory must exist");

    assert_eq!(detail.memory.id, first.id);
    if let Some(body) = detail.body.as_ref() {
        assert!(!body.is_empty());
        assert_eq!(detail.size_bytes as usize, body.len());
    }
}

#[test]
#[ignore]
fn golden_get_returns_none_for_missing_id() {
    let repo = open_repo();
    let result = repo
        .get("00000000-0000-0000-0000-000000000000")
        .expect("get");
    assert!(result.is_none());
}

#[test]
#[ignore]
fn golden_search_with_zero_hits_does_not_break_sql() {
    use echo_studio_lib::echovault::SearchMode;
    // Regression: empty ranked_rowids built `CASE rowid  ELSE 999999 END`
    // which is invalid SQL. Now должно вернуть пустой page без паники.
    let repo = open_repo();
    let rt = tokio::runtime::Runtime::new().unwrap();
    let page = rt
        .block_on(repo.search(&MemoriesFilter {
            query: Some("zzzqqqxxxnoSuchTokenWillEverMatchAnyMemory42".into()),
            mode: Some(SearchMode::Lexical),
            limit: Some(10),
            ..Default::default()
        }))
        .expect("search must not error");
    assert_eq!(page.total, 0);
    assert!(page.items.is_empty());
}
